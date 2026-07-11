"""
Serverless deployment of Card Slam: Lambda (container image) + Function URL +
CloudFront + S3, reusing the EXISTING DynamoDB tables and Secrets Manager secret.

Data safety: this stack *imports* the five tables by name (from_table_name) — it
never creates or owns them, so CloudFormation has no authority to delete them.
The original Fargate stack (card_slam/stack.py) can keep running side-by-side
during migration; nothing here touches its resources except the shared, imported
tables/secret/ECR repo.

STATUS: Phase-0 skeleton. The API + hosting core is wired up. The auto-code
pipeline (queue-processor Lambda, EventBridge rule, CodeBuild project) is NOT yet
ported here — see the TODO block near the bottom. Do not `cdk deploy` this until
the `lambda-latest` image exists in ECR (Phase 1).
"""
from aws_cdk import (
    Stack,
    RemovalPolicy,
    CfnOutput,
    Duration,
    SecretValue,
    aws_dynamodb as dynamodb,
    aws_secretsmanager as secretsmanager,
    aws_ecr as ecr,
    aws_lambda as lambda_,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_iam as iam,
    aws_logs as logs,
    aws_codebuild as codebuild,
    aws_events as events,
    aws_events_targets as targets,
)
from constructs import Construct

TABLE_NAMES = {
    "CategoriesTable": "card-slam-categories",
    "CardsTable": "card-slam-cards",
    "UsersTable": "card-slam-users",
    "FeatureRunsTable": "card-slam-feature-runs",
    "IntegrationsTable": "card-slam-integrations",
}


class CardSlamServerlessStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── Imported data (referenced by name; never created or deleted here) ──
        tables = {
            key: dynamodb.Table.from_table_name(self, key, name)
            for key, name in TABLE_NAMES.items()
        }
        secret = secretsmanager.Secret.from_secret_name_v2(
            self, "AppSecret", "card-slam/config"
        )
        repo = ecr.Repository.from_repository_name(self, "AppRepo", "card-slam")

        # ── API Lambda (container image) ──────────────────────────────────────
        # Tag `lambda-latest` is built/pushed by deploy.sh (Dockerfile.lambda).
        api_fn = lambda_.DockerImageFunction(
            self,
            "ApiFn",
            function_name="card-slam-api",
            code=lambda_.DockerImageCode.from_ecr(repo, tag_or_digest="lambda-latest"),
            memory_size=1024,
            timeout=Duration.seconds(60),
            environment={
                "CATEGORIES_TABLE": TABLE_NAMES["CategoriesTable"],
                "CARDS_TABLE": TABLE_NAMES["CardsTable"],
                "USERS_TABLE": TABLE_NAMES["UsersTable"],
                "FEATURE_RUNS_TABLE": TABLE_NAMES["FeatureRunsTable"],
                "INTEGRATIONS_TABLE": TABLE_NAMES["IntegrationsTable"],
                "SECRET_NAME": "card-slam/config",
                # Hardcoded (not distribution.distribution_domain_name) to avoid a
                # circular dependency: the Distribution's origin is this Lambda, so
                # the Lambda cannot depend on the Distribution. The generated domain
                # is stable for the life of the distribution. Must match the Zoho
                # Authorized Redirect URI:
                #   <APP_BASE_URL>/api/integrations/zoho/callback
                "APP_BASE_URL": "https://d3fdblmghw0deo.cloudfront.net",
            },
        )
        for table in tables.values():
            table.grant_read_write_data(api_fn)
        secret.grant_read(api_fn)

        fn_url = api_fn.add_function_url(
            auth_type=lambda_.FunctionUrlAuthType.NONE,
        )

        # ── SPA hosting: S3 (private) + CloudFront ────────────────────────────
        # Bucket holds only build artifacts (frontend/dist), so it's safe to
        # destroy/empty on stack teardown — this is NOT application data.
        bucket = s3.Bucket(
            self,
            "SpaBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        distribution = cloudfront.Distribution(
            self,
            "Distribution",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            ),
            additional_behaviors={
                "/api/*": cloudfront.BehaviorOptions(
                    origin=origins.FunctionUrlOrigin(
                        fn_url,
                        read_timeout=Duration.seconds(60),  # AI-call headroom
                    ),
                    allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                    cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                    origin_request_policy=cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                ),
            },
            # SPA fallback: serve index.html for client-side routes (e.g. /list).
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.seconds(0),
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.seconds(0),
                ),
            ],
        )

        # ── Auto-code pipeline (queue processor + CodeBuild) ──────────────────
        # Gated behind the `enable_autocode` context flag because these declare
        # region/account-singleton resources (CodeBuild project name, queue
        # processor function name, GitHub source credentials) that also exist in
        # the legacy Fargate stack. Keep it OFF while both stacks coexist:
        #     cdk deploy CardSlamServerlessStack                     # off
        # and turn it ON only after the legacy stack is destroyed (cutover):
        #     cdk deploy CardSlamServerlessStack -c enable_autocode=true
        if self.node.try_get_context("enable_autocode"):
            self._add_autocode_pipeline(
                repo=repo,
                secret=secret,
                cards_table=tables["CardsTable"],
                feature_runs_table=tables["FeatureRunsTable"],
                api_fn=api_fn,
                bucket=bucket,
                distribution=distribution,
            )

        # ── Outputs ───────────────────────────────────────────────────────────
        CfnOutput(
            self,
            "AppURL",
            value=f"https://{distribution.distribution_domain_name}",
            description="Application URL (set APP_BASE_URL to this, then redeploy)",
        )
        CfnOutput(self, "SpaBucketName", value=bucket.bucket_name)
        CfnOutput(
            self,
            "DistributionId",
            value=distribution.distribution_id,
            description="CloudFront distribution ID (for cache invalidation)",
        )
        CfnOutput(self, "ApiFunctionUrl", value=fn_url.url)

    # ── Auto-code pipeline construction ──────────────────────────────────────
    def _add_autocode_pipeline(
        self,
        *,
        repo,
        secret,
        cards_table,
        feature_runs_table,
        api_fn,
        bucket,
        distribution,
    ) -> None:
        # Register the GitHub PAT for CodeBuild source auth. This is a
        # region-level singleton; it must NOT coexist with the legacy stack's
        # copy (see the enable_autocode gate).
        codebuild.GitHubSourceCredentials(
            self,
            "GitHubCreds",
            access_token=SecretValue.secrets_manager(
                "card-slam/config", json_field="github_pat"
            ),
        )

        codebuild_role = iam.Role(
            self,
            "CodeBuildRole",
            assumed_by=iam.ServicePrincipal("codebuild.amazonaws.com"),
        )
        cards_table.grant_read_write_data(codebuild_role)
        feature_runs_table.grant_read_write_data(codebuild_role)
        secret.grant_read(codebuild_role)
        repo.grant_pull_push(codebuild_role)
        # Deploy targets: update the API Lambda, sync the SPA bucket, and
        # invalidate CloudFront (replaces the legacy ecs:UpdateService).
        codebuild_role.add_to_policy(
            iam.PolicyStatement(
                actions=["lambda:UpdateFunctionCode", "lambda:GetFunction"],
                resources=[api_fn.function_arn],
            )
        )
        bucket.grant_read_write(codebuild_role)
        codebuild_role.add_to_policy(
            iam.PolicyStatement(
                actions=["cloudfront:CreateInvalidation"],
                resources=[
                    self.format_arn(
                        service="cloudfront",
                        region="",  # CloudFront ARNs are global
                        resource="distribution",
                        resource_name=distribution.distribution_id,
                    )
                ],
            )
        )
        codebuild_role.add_to_policy(
            iam.PolicyStatement(
                actions=["ecr:GetAuthorizationToken"],
                resources=["*"],
            )
        )

        auto_code_project = codebuild.Project(
            self,
            "AutoCodeProject",
            project_name="card-slam-auto-code",
            source=codebuild.Source.git_hub(
                owner="tmfconan",
                repo="card-slam",
                clone_depth=1,
            ),
            environment=codebuild.BuildEnvironment(
                build_image=codebuild.LinuxBuildImage.STANDARD_7_0,
                privileged=True,  # needed for Docker builds
                compute_type=codebuild.ComputeType.MEDIUM,
            ),
            environment_variables={
                "REGION": codebuild.BuildEnvironmentVariable(value=self.region),
                "ECR_REPO": codebuild.BuildEnvironmentVariable(
                    value=repo.repository_uri
                ),
                "SPA_BUCKET": codebuild.BuildEnvironmentVariable(
                    value=bucket.bucket_name
                ),
                "CF_DIST_ID": codebuild.BuildEnvironmentVariable(
                    value=distribution.distribution_id
                ),
                "CARDS_TABLE": codebuild.BuildEnvironmentVariable(
                    value=cards_table.table_name
                ),
                "FEATURE_RUNS_TABLE": codebuild.BuildEnvironmentVariable(
                    value=feature_runs_table.table_name
                ),
                "ANTHROPIC_API_KEY": codebuild.BuildEnvironmentVariable(
                    value="card-slam/config:anthropic_api_key",
                    type=codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
                ),
                "GITHUB_TOKEN": codebuild.BuildEnvironmentVariable(
                    value="card-slam/config:github_pat",
                    type=codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
                ),
            },
            role=codebuild_role,
            build_spec=codebuild.BuildSpec.from_object(
                {
                    "version": "0.2",
                    "phases": {
                        "install": {
                            "runtime-versions": {"nodejs": 20, "python": "3.12"},
                            "commands": [
                                "npm install -g @anthropic-ai/claude-code",
                                "pip install -r backend/requirements.txt pytest moto[dynamodb]",
                                "cd frontend && npm ci && cd ..",
                            ],
                        },
                        "pre_build": {
                            "commands": [
                                'test -n "${CARD_ID}" || { echo "ERROR: CARD_ID is not set. This build must be triggered by the queue processor Lambda, not manually."; exit 1; }',
                                'git config user.email "autocode@card-slam"',
                                'git config user.name "Card Slam Auto-Code"',
                                'git config --global --add safe.directory "${CODEBUILD_SRC_DIR}"',
                                'git remote set-url origin "https://${GITHUB_TOKEN}@github.com/tmfconan/card-slam.git"',
                                'git checkout -b "auto-code/${CARD_ID}"',
                                'aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_REPO"',
                            ],
                        },
                        "build": {
                            "commands": [
                                "bash scripts/run_claude.sh",
                                "make test",
                            ],
                        },
                        # Deploy step: build the Lambda image (Dockerfile.lambda),
                        # push, update the function, then publish the SPA to S3 and
                        # invalidate CloudFront — the serverless equivalent of the
                        # legacy "docker push + ecs update-service".
                        "post_build": {
                            "commands": [
                                (
                                    'if [ "${CODEBUILD_BUILD_SUCCEEDING}" = "1" ]; then '
                                    "git add -A && "
                                    '(git diff --staged --quiet || git commit -m "auto-code: ${FEATURE_TITLE}") && '
                                    'git push -u origin "auto-code/${CARD_ID}" || true; '
                                    # --provenance/--sbom off: Lambda needs a plain
                                    # schema2 manifest, not buildx's OCI index.
                                    "docker buildx build --platform linux/amd64 "
                                    "--provenance=false --sbom=false "
                                    '-f Dockerfile.lambda -t "${ECR_REPO}:lambda-latest" --push . && '
                                    "aws lambda update-function-code --function-name card-slam-api "
                                    '--image-uri "${ECR_REPO}:lambda-latest" --region "$REGION" && '
                                    "(cd frontend && npm run build) && "
                                    'aws s3 sync frontend/dist "s3://${SPA_BUCKET}" --delete && '
                                    "aws cloudfront create-invalidation "
                                    '--distribution-id "$CF_DIST_ID" --paths "/*" && '
                                    "python3 scripts/update_run_status.py success; "
                                    "else python3 scripts/update_run_status.py failure; fi"
                                ),
                            ],
                        },
                    },
                }
            ),
            logging=codebuild.LoggingOptions(
                cloud_watch=codebuild.CloudWatchLoggingOptions(
                    log_group=logs.LogGroup(
                        self,
                        "AutoCodeLogs",
                        log_group_name="/aws/codebuild/card-slam-auto-code",
                        retention=logs.RetentionDays.ONE_MONTH,
                        removal_policy=RemovalPolicy.DESTROY,
                    )
                )
            ),
        )

        # Queue processor Lambda (EventBridge every 5 min) — unchanged from the
        # legacy stack; it only starts CodeBuild and touches DynamoDB.
        processor_fn = lambda_.Function(
            self,
            "QueueProcessor",
            function_name="card-slam-queue-processor",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.handler",
            code=lambda_.Code.from_asset("lambda/queue_processor"),
            timeout=Duration.minutes(1),
            environment={
                "CARDS_TABLE": cards_table.table_name,
                "FEATURE_RUNS_TABLE": feature_runs_table.table_name,
                "CODEBUILD_PROJECT": auto_code_project.project_name,
            },
        )
        cards_table.grant_read_write_data(processor_fn)
        feature_runs_table.grant_read_write_data(processor_fn)
        processor_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["codebuild:StartBuild"],
                resources=[auto_code_project.project_arn],
            )
        )

        events.Rule(
            self,
            "ProcessorSchedule",
            schedule=events.Schedule.rate(Duration.minutes(5)),
            description="Trigger auto-code queue processor every 5 minutes",
        ).add_target(targets.LambdaFunction(processor_fn))

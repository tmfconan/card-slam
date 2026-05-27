from aws_cdk import (
    Stack,
    RemovalPolicy,
    CfnOutput,
    Duration,
    SecretValue,
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_ecs_patterns as ecs_patterns,
    aws_ecr as ecr,
    aws_dynamodb as dynamodb,
    aws_secretsmanager as secretsmanager,
    aws_iam as iam,
    aws_logs as logs,
    aws_codebuild as codebuild,
    aws_lambda as lambda_,
    aws_events as events,
    aws_events_targets as targets,
)
from constructs import Construct


class CardSlamStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        vpc = ec2.Vpc(self, "Vpc", max_azs=2, nat_gateways=1)

        repo = ecr.Repository(
            self,
            "AppRepo",
            repository_name="card-slam",
            removal_policy=RemovalPolicy.DESTROY,
            empty_on_delete=True,
        )

        categories_table = dynamodb.Table(
            self,
            "CategoriesTable",
            table_name="card-slam-categories",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        cards_table = dynamodb.Table(
            self,
            "CardsTable",
            table_name="card-slam-cards",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )
        cards_table.add_global_secondary_index(
            index_name="status-index",
            partition_key=dynamodb.Attribute(
                name="status", type=dynamodb.AttributeType.STRING
            ),
        )

        users_table = dynamodb.Table(
            self,
            "UsersTable",
            table_name="card-slam-users",
            partition_key=dynamodb.Attribute(
                name="username", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        feature_runs_table = dynamodb.Table(
            self,
            "FeatureRunsTable",
            table_name="card-slam-feature-runs",
            partition_key=dynamodb.Attribute(
                name="run_id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # Secret is created/managed by scripts/bootstrap.sh — import it here
        app_secret = secretsmanager.Secret.from_secret_name_v2(
            self,
            "AppSecret",
            "card-slam/config",
        )

        cluster = ecs.Cluster(self, "Cluster", vpc=vpc, cluster_name="card-slam")

        execution_role = iam.Role(
            self,
            "TaskExecutionRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AmazonECSTaskExecutionRolePolicy"
                )
            ],
        )

        task_role = iam.Role(
            self,
            "TaskRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        )
        categories_table.grant_read_write_data(task_role)
        cards_table.grant_read_write_data(task_role)
        users_table.grant_read_write_data(task_role)
        feature_runs_table.grant_read_write_data(task_role)
        app_secret.grant_read(task_role)

        task_def = ecs.FargateTaskDefinition(
            self,
            "TaskDef",
            memory_limit_mib=512,
            cpu=256,
            execution_role=execution_role,
            task_role=task_role,
        )

        task_def.add_container(
            "AppContainer",
            image=ecs.ContainerImage.from_ecr_repository(repo, "latest"),
            logging=ecs.LogDrivers.aws_logs(
                stream_prefix="card-slam",
                log_retention=logs.RetentionDays.ONE_WEEK,
            ),
            environment={
                "CATEGORIES_TABLE": categories_table.table_name,
                "CARDS_TABLE": cards_table.table_name,
                "USERS_TABLE": users_table.table_name,
                "FEATURE_RUNS_TABLE": feature_runs_table.table_name,
                "SECRET_NAME": app_secret.secret_name,
                "AWS_DEFAULT_REGION": self.region,
            },
            port_mappings=[ecs.PortMapping(container_port=8000)],
        )

        fargate_service = ecs_patterns.ApplicationLoadBalancedFargateService(
            self,
            "Service",
            cluster=cluster,
            task_definition=task_def,
            desired_count=1,
            listener_port=80,
            public_load_balancer=True,
            assign_public_ip=False,
        )

        fargate_service.target_group.configure_health_check(
            path="/health",
            healthy_http_codes="200",
            healthy_threshold_count=2,
            unhealthy_threshold_count=3,
        )

        # ── CodeBuild: auto-code project ──────────────────────────────────────

        # Register GitHub PAT from Secrets Manager for CodeBuild source auth
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
        app_secret.grant_read(codebuild_role)
        repo.grant_pull_push(codebuild_role)
        codebuild_role.add_to_policy(
            iam.PolicyStatement(
                actions=["ecs:UpdateService", "ecs:ListServices", "ecs:DescribeServices"],
                resources=["*"],
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
                "ECR_REPO": codebuild.BuildEnvironmentVariable(value=repo.repository_uri),
                "ECS_CLUSTER": codebuild.BuildEnvironmentVariable(value="card-slam"),
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
            build_spec=codebuild.BuildSpec.from_object({
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
                    "post_build": {
                        "commands": [
                            (
                                'if [ "${CODEBUILD_BUILD_SUCCEEDING}" = "1" ]; then '
                                "git add -A && "
                                '(git diff --staged --quiet || git commit -m "auto-code: ${FEATURE_TITLE}") && '
                                'git push -u origin "auto-code/${CARD_ID}" || true; '
                                "docker build --platform linux/amd64 -t card-slam:latest . && "
                                'docker tag card-slam:latest "${ECR_REPO}:latest" && '
                                'docker push "${ECR_REPO}:latest" && '
                                'SERVICE=$(aws ecs list-services --cluster "$ECS_CLUSTER" --region "$REGION" --query "serviceArns[0]" --output text | awk -F/ \'{print $NF}\') && '
                                'aws ecs update-service --cluster "$ECS_CLUSTER" --service "$SERVICE" --force-new-deployment --region "$REGION" && '
                                "python3 scripts/update_run_status.py success; "
                                "else python3 scripts/update_run_status.py failure; fi"
                            ),
                        ],
                    },
                },
            }),
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

        # ── Lambda: queue processor (triggered by EventBridge every 5 min) ────

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

        schedule_rule = events.Rule(
            self,
            "ProcessorSchedule",
            schedule=events.Schedule.rate(Duration.minutes(5)),
            description="Trigger auto-code queue processor every 5 minutes",
        )
        schedule_rule.add_target(targets.LambdaFunction(processor_fn))

        # ── Outputs ────────────────────────────────────────────────────────────

        CfnOutput(
            self,
            "AppURL",
            value=f"http://{fargate_service.load_balancer.load_balancer_dns_name}",
            description="Application URL",
        )
        CfnOutput(
            self,
            "ECRRepository",
            value=repo.repository_uri,
            description="ECR Repository URI (needed for deploy script)",
        )
        CfnOutput(
            self,
            "CodeBuildProject",
            value=auto_code_project.project_name,
            description="Auto-code CodeBuild project name",
        )

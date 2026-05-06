from aws_cdk import (
    Stack,
    RemovalPolicy,
    CfnOutput,
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_ecs_patterns as ecs_patterns,
    aws_ecr as ecr,
    aws_dynamodb as dynamodb,
    aws_secretsmanager as secretsmanager,
    aws_iam as iam,
    aws_logs as logs,
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

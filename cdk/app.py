#!/usr/bin/env python3
import aws_cdk as cdk
from card_slam.stack import CardSlamStack
from card_slam.serverless_stack import CardSlamServerlessStack

app = cdk.App()
CardSlamStack(
    app,
    "CardSlamStack",
    env=cdk.Environment(region="us-east-2"),
)
# Serverless migration target — deploy selectively:
#   cd cdk && cdk deploy CardSlamServerlessStack
CardSlamServerlessStack(
    app,
    "CardSlamServerlessStack",
    env=cdk.Environment(region="us-east-2"),
)
app.synth()

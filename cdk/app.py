#!/usr/bin/env python3
import aws_cdk as cdk
from card_slam.stack import CardSlamStack

app = cdk.App()
CardSlamStack(
    app,
    "CardSlamStack",
    env=cdk.Environment(region="us-east-2"),
)
app.synth()

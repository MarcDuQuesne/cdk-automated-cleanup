import * as cdk from "aws-cdk-lib";

import { aws_codepipeline_actions as actions, aws_codepipeline as codepipeline } from "aws-cdk-lib";

import { Construct } from "constructs";

export interface DeploymentPipelineProps {
  stackName: string;
  cdkAppPath: string;
}

export class DeploymentPipeline extends Construct {
  constructor(scope: Construct, id: string, props: DeploymentPipelineProps) {
    super(scope, id);

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    // Deployment Pipeline
    const deploymentPipeline = new codepipeline.Pipeline(this, "DeploymentPipeline", {
      pipelineName: "DeploymentPipeline",
      restartExecutionOnUpdate: true,
    });

    // Source Stage
    deploymentPipeline.addStage({
      stageName: "Source",
      actions: [
        new actions.GitHubSourceAction({
          actionName: "GitHubSource",
          owner: "your-github-owner",
          repo: "your-github-repo",
          branch: "main",
          oauthToken: cdk.SecretValue.secretsManager("github-token"),
          output: sourceOutput,
        }),
      ],
    });

    // Build Stage
    deploymentPipeline.addStage({
      stageName: "Build",
      actions: [
        new actions.CodeBuildAction({
          actionName: "CDKBuild",
          project: new codebuild.PipelineProject(this, "CDKBuildProject", {
            projectName: "CDKBuildProject",
            buildSpec: codebuild.BuildSpec.fromObject({
              version: "0.2",
              phases: {
                install: {
                  commands: ["npm ci"],
                },
                build: {
                  commands: [`npx cdk deploy ${props.stackName}`],
                },
              },
              artifacts: {
                "base-directory": "cdk.out",
                files: [`${props.stackName}.template.json`],
              },
            }),
          }),
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // Destruction Pipeline
    const destructionPipeline = new codepipeline.Pipeline(this, "DestructionPipeline", {
      pipelineName: "DestructionPipeline",
      restartExecutionOnUpdate: true,
    });

    // Triggering the Destruction Pipeline on Success or Failure of Deployment Pipeline
    deploymentPipeline.onStateChange("TriggerDestruction", {
      target: new actions.CodePipeline(destructionPipeline),
      eventPattern: {
        detail: {
          state: ["SUCCEEDED", "FAILED"],
        },
      },
    });

    // Destruction Stage
    destructionPipeline.addStage({
      stageName: "Destroy",
      actions: [
        new actions.CodeBuildAction({
          actionName: "CDKDestroy",
          project: new codebuild.PipelineProject(this, "CDKDestroyProject", {
            projectName: "CDKDestroyProject",
            buildSpec: codebuild.BuildSpec.fromObject({
              version: "0.2",
              phases: {
                install: {
                  commands: ["npm ci"],
                },
                build: {
                  commands: [`npx cdk destroy ${props.stackName}`],
                },
              },
            }),
          }),
          input: buildOutput,
        }),
      ],
    });
  }
}

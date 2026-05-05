################################################################################
# Revenue Ops Step Functions — Medallion Pipeline State Machine
#
# Pipeline execution order:
#   1. Parallel extraction (weather, holidays, local events via Lambda)
#   2. Parallel bronze→silver transformations (revenue, demand, weather, competition)
#   3. Build gold revenue context mart
#   4. Detect revenue anomalies
#   5. Parallel gold enrichment (link causes, map actions) — can run concurrently
################################################################################

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  state_machine_name = "${var.name_prefix}-medallion-pipeline"

  # ASL definition rendered with actual ARNs and job names
  definition = jsonencode({
    Comment = "Revenue Ops Serverless Batch ETL — Medallion Pipeline (Bronze → Silver → Gold)"
    StartAt = "ExtractRawData"

    States = {

      ExtractRawData = {
        Type    = "Parallel"
        Comment = "Parallel Lambda extractions: weather, holidays, local events"
        Branches = [
          {
            StartAt = "FetchWeatherASOS"
            States = {
              FetchWeatherASOS = {
                Type     = "Task"
                Resource = "arn:aws:states:::lambda:invoke"
                Parameters = {
                  FunctionName = var.weather_lambda_arn
                  "Payload.$"  = "$"
                }
                ResultPath = "$.weather_result"
                Retry = [
                  {
                    ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
                    IntervalSeconds = 10
                    MaxAttempts     = 3
                    BackoffRate     = 2
                  }
                ]
                Catch = [
                  {
                    ErrorEquals = ["States.ALL"]
                    Next        = "WeatherExtractionFailed"
                    ResultPath  = "$.error"
                  }
                ]
                End = true
              }
              WeatherExtractionFailed = {
                Type  = "Fail"
                Cause = "Weather extraction Lambda failed after retries"
                Error = "WeatherExtractionError"
              }
            }
          },
          {
            StartAt = "FetchHolidays"
            States = {
              FetchHolidays = {
                Type     = "Task"
                Resource = "arn:aws:states:::lambda:invoke"
                Parameters = {
                  FunctionName = var.holidays_lambda_arn
                  "Payload.$"  = "$"
                }
                ResultPath = "$.holidays_result"
                Retry = [
                  {
                    ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
                    IntervalSeconds = 10
                    MaxAttempts     = 3
                    BackoffRate     = 2
                  }
                ]
                Catch = [
                  {
                    ErrorEquals = ["States.ALL"]
                    Next        = "HolidaysExtractionFailed"
                    ResultPath  = "$.error"
                  }
                ]
                End = true
              }
              HolidaysExtractionFailed = {
                Type  = "Fail"
                Cause = "Holidays extraction Lambda failed after retries"
                Error = "HolidaysExtractionError"
              }
            }
          },
          {
            StartAt = "FetchLocalEvents"
            States = {
              FetchLocalEvents = {
                Type     = "Task"
                Resource = "arn:aws:states:::lambda:invoke"
                Parameters = {
                  FunctionName = var.local_events_lambda_arn
                  "Payload.$"  = "$"
                }
                ResultPath = "$.local_events_result"
                Retry = [
                  {
                    ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
                    IntervalSeconds = 10
                    MaxAttempts     = 3
                    BackoffRate     = 2
                  }
                ]
                Catch = [
                  {
                    ErrorEquals = ["States.ALL"]
                    Next        = "LocalEventsExtractionFailed"
                    ResultPath  = "$.error"
                  }
                ]
                End = true
              }
              LocalEventsExtractionFailed = {
                Type  = "Fail"
                Cause = "Local events extraction Lambda failed after retries"
                Error = "LocalEventsExtractionError"
              }
            }
          }
        ]
        ResultPath = "$.extraction_results"
        Next       = "BronzeToSilver"
      }

      BronzeToSilver = {
        Type    = "Parallel"
        Comment = "Parallel Glue jobs: bronze → silver for all signal types"
        Branches = [
          {
            StartAt = "BronzeToSilverRevenue"
            States = {
              BronzeToSilverRevenue = {
                Type     = "Task"
                Resource = "arn:aws:states:::glue:startJobRun.sync"
                Parameters = {
                  JobName = var.glue_job_names["bronze_to_silver_revenue"]
                }
                ResultPath = "$.revenue_silver_result"
                Retry = [
                  {
                    ErrorEquals     = ["Glue.ConcurrentRunsExceededException"]
                    IntervalSeconds = 30
                    MaxAttempts     = 3
                    BackoffRate     = 1.5
                  }
                ]
                End = true
              }
            }
          },
          {
            StartAt = "BronzeToSilverDemand"
            States = {
              BronzeToSilverDemand = {
                Type     = "Task"
                Resource = "arn:aws:states:::glue:startJobRun.sync"
                Parameters = {
                  JobName = var.glue_job_names["bronze_to_silver_demand"]
                }
                ResultPath = "$.demand_silver_result"
                Retry = [
                  {
                    ErrorEquals     = ["Glue.ConcurrentRunsExceededException"]
                    IntervalSeconds = 30
                    MaxAttempts     = 3
                    BackoffRate     = 1.5
                  }
                ]
                End = true
              }
            }
          },
          {
            StartAt = "BronzeToSilverWeather"
            States = {
              BronzeToSilverWeather = {
                Type     = "Task"
                Resource = "arn:aws:states:::glue:startJobRun.sync"
                Parameters = {
                  JobName = var.glue_job_names["bronze_to_silver_weather"]
                }
                ResultPath = "$.weather_silver_result"
                Retry = [
                  {
                    ErrorEquals     = ["Glue.ConcurrentRunsExceededException"]
                    IntervalSeconds = 30
                    MaxAttempts     = 3
                    BackoffRate     = 1.5
                  }
                ]
                End = true
              }
            }
          },
          {
            StartAt = "BronzeToSilverCompetition"
            States = {
              BronzeToSilverCompetition = {
                Type     = "Task"
                Resource = "arn:aws:states:::glue:startJobRun.sync"
                Parameters = {
                  JobName = var.glue_job_names["bronze_to_silver_competition"]
                }
                ResultPath = "$.competition_silver_result"
                Retry = [
                  {
                    ErrorEquals     = ["Glue.ConcurrentRunsExceededException"]
                    IntervalSeconds = 30
                    MaxAttempts     = 3
                    BackoffRate     = 1.5
                  }
                ]
                End = true
              }
            }
          }
        ]
        ResultPath = "$.silver_results"
        Next       = "BuildGoldContextMart"
      }

      BuildGoldContextMart = {
        Type     = "Task"
        Resource = "arn:aws:states:::glue:startJobRun.sync"
        Parameters = {
          JobName = var.glue_job_names["build_gold_revenue_context_mart"]
        }
        ResultPath = "$.context_mart_result"
        Retry = [
          {
            ErrorEquals     = ["Glue.ConcurrentRunsExceededException"]
            IntervalSeconds = 30
            MaxAttempts     = 3
            BackoffRate     = 1.5
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            Next        = "PipelineFailed"
            ResultPath  = "$.error"
          }
        ]
        Next = "DetectAnomalies"
      }

      DetectAnomalies = {
        Type     = "Task"
        Resource = "arn:aws:states:::glue:startJobRun.sync"
        Parameters = {
          JobName = var.glue_job_names["detect_revenue_anomalies"]
        }
        ResultPath = "$.anomaly_result"
        Retry = [
          {
            ErrorEquals     = ["Glue.ConcurrentRunsExceededException"]
            IntervalSeconds = 30
            MaxAttempts     = 3
            BackoffRate     = 1.5
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            Next        = "PipelineFailed"
            ResultPath  = "$.error"
          }
        ]
        Next = "EnrichGoldLayer"
      }

      EnrichGoldLayer = {
        Type    = "Parallel"
        Comment = "Parallel gold enrichment: cause linking and action recommendations"
        Branches = [
          {
            StartAt = "LinkCauseEvidence"
            States = {
              LinkCauseEvidence = {
                Type     = "Task"
                Resource = "arn:aws:states:::glue:startJobRun.sync"
                Parameters = {
                  JobName = var.glue_job_names["link_cause_evidence"]
                }
                ResultPath = "$.cause_result"
                Retry = [
                  {
                    ErrorEquals     = ["Glue.ConcurrentRunsExceededException"]
                    IntervalSeconds = 30
                    MaxAttempts     = 3
                    BackoffRate     = 1.5
                  }
                ]
                End = true
              }
            }
          },
          {
            StartAt = "MapActionRecommendations"
            States = {
              MapActionRecommendations = {
                Type     = "Task"
                Resource = "arn:aws:states:::glue:startJobRun.sync"
                Parameters = {
                  JobName = var.glue_job_names["map_action_recommendations"]
                }
                ResultPath = "$.recommendations_result"
                Retry = [
                  {
                    ErrorEquals     = ["Glue.ConcurrentRunsExceededException"]
                    IntervalSeconds = 30
                    MaxAttempts     = 3
                    BackoffRate     = 1.5
                  }
                ]
                End = true
              }
            }
          }
        ]
        ResultPath = "$.enrichment_results"
        Next       = "PipelineSucceeded"
      }

      PipelineSucceeded = {
        Type = "Succeed"
      }

      PipelineFailed = {
        Type  = "Fail"
        Cause = "Revenue Ops Medallion Pipeline failed — check CloudWatch Logs for details"
        Error = "PipelineExecutionError"
      }
    }
  })
}

resource "aws_sfn_state_machine" "revenue_ops_medallion_pipeline" {
  name     = local.state_machine_name
  role_arn = var.step_functions_role_arn
  type     = "STANDARD"

  definition = local.definition

  logging_configuration {
    level                  = "ERROR"
    include_execution_data = false
    log_destination        = "${aws_cloudwatch_log_group.state_machine.arn}:*"
  }

  tags = merge(var.tags, {
    Name = local.state_machine_name
  })
}

resource "aws_cloudwatch_log_group" "state_machine" {
  name              = "/aws/states/${local.state_machine_name}"
  retention_in_days = 30

  tags = var.tags
}

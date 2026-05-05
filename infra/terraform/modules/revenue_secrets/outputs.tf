output "secrets_parameter_names" {
  description = "List of SSM Parameter Store parameter names created by this module."
  value = [
    aws_ssm_parameter.seoul_openapi_key.name,
    aws_ssm_parameter.data_go_kr_service_key.name,
    aws_ssm_parameter.kma_asos_station_id.name,
  ]
}

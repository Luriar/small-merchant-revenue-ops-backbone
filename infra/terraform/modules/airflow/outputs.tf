output "environment_arn" {
  value = aws_mwaa_environment.main.arn
}

output "webserver_url" {
  description = "MWAA webserver URL (PRIVATE_ONLY — VPN/bastion 경유 접근)"
  value       = aws_mwaa_environment.main.webserver_url
}

output "dags_bucket_name" {
  description = "DAG 업로드 S3 bucket. dags/ prefix 아래 .py 파일 업로드."
  value       = aws_s3_bucket.dags.id
}

output "dags_s3_path" {
  value = "s3://${aws_s3_bucket.dags.id}/dags"
}

output "execution_role_arn" {
  value = aws_iam_role.mwaa.arn
}

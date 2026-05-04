output "instance_id" {
  value = aws_instance.clickhouse.id
}

output "private_ip" {
  description = "ClickHouse 접속용 IP (private). EKS pod에서 사용."
  value       = aws_instance.clickhouse.private_ip
}

output "private_dns" {
  value = aws_instance.clickhouse.private_dns
}

output "security_group_id" {
  value = aws_security_group.clickhouse.id
}

output "http_endpoint" {
  description = "ClickHouse HTTP endpoint (EKS pod에서 사용)"
  value       = "http://${aws_instance.clickhouse.private_ip}:8123"
}

output "native_endpoint" {
  description = "ClickHouse native endpoint (Kafka engine 등에서 사용)"
  value       = "${aws_instance.clickhouse.private_ip}:9000"
}

output "weather_lambda_arn" {
  description = "ARN of the fetch_weather_asos Lambda function."
  value       = aws_lambda_function.fetch_weather_asos.arn
}

output "holidays_lambda_arn" {
  description = "ARN of the fetch_holidays Lambda function."
  value       = aws_lambda_function.fetch_holidays.arn
}

output "local_events_lambda_arn" {
  description = "ARN of the fetch_local_events Lambda function."
  value       = aws_lambda_function.fetch_local_events.arn
}

output "weather_lambda_name" {
  description = "Name of the fetch_weather_asos Lambda function."
  value       = aws_lambda_function.fetch_weather_asos.function_name
}

output "holidays_lambda_name" {
  description = "Name of the fetch_holidays Lambda function."
  value       = aws_lambda_function.fetch_holidays.function_name
}

output "local_events_lambda_name" {
  description = "Name of the fetch_local_events Lambda function."
  value       = aws_lambda_function.fetch_local_events.function_name
}

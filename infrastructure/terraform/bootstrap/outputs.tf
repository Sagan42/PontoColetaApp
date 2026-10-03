output "state_bucket_name" {
  description = "Bucket to reference in the backend block of each environment."
  value       = aws_s3_bucket.state.id
}

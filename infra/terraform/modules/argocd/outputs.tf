output "namespace" {
  value = helm_release.argocd.namespace
}

output "release_name" {
  value = helm_release.argocd.name
}

output "initial_admin_password_command" {
  description = "Argo CD 초기 admin password 회수 명령. bastion에서 실행."
  value       = "kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
}

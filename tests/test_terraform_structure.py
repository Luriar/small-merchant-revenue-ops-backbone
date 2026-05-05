"""
Tests: Terraform file structure exists in expected revenue-dev layout.
"""
from pathlib import Path
import pytest

_TF_ROOT = Path(__file__).parent.parent / "infra" / "terraform"

REQUIRED_MODULES = [
    "revenue_data_lake",
    "revenue_glue_catalog",
    "revenue_athena",
    "revenue_etl_iam",
    "revenue_lambda_extractors",
    "revenue_glue_jobs",
    "revenue_step_functions",
    "revenue_eventbridge",
    "revenue_observability",
    "revenue_secrets",
]

REQUIRED_ENV_FILES = [
    "versions.tf",
    "providers.tf",
    "backend.tf",
    "variables.tf",
    "locals.tf",
    "main.tf",
    "outputs.tf",
    "terraform.tfvars.example",
]


def test_terraform_root_exists():
    assert _TF_ROOT.exists(), "infra/terraform/ does not exist"


def test_bootstrap_dir_exists():
    assert (_TF_ROOT / "bootstrap").is_dir()
    assert (_TF_ROOT / "bootstrap" / "main.tf").exists()


def test_revenue_dev_env_exists():
    env = _TF_ROOT / "envs" / "revenue-dev"
    assert env.is_dir(), "envs/revenue-dev/ does not exist"


def test_revenue_dev_required_files():
    env = _TF_ROOT / "envs" / "revenue-dev"
    for fname in REQUIRED_ENV_FILES:
        assert (env / fname).exists(), f"Missing revenue-dev/{fname}"


def test_all_revenue_modules_exist():
    modules = _TF_ROOT / "modules"
    for mod in REQUIRED_MODULES:
        mod_dir = modules / mod
        assert mod_dir.is_dir(), f"Module '{mod}' not found"
        assert (mod_dir / "main.tf").exists(), f"Module '{mod}' missing main.tf"
        assert (mod_dir / "variables.tf").exists(), f"Module '{mod}' missing variables.tf"
        assert (mod_dir / "outputs.tf").exists(), f"Module '{mod}' missing outputs.tf"


def test_no_old_product_ops_modules():
    modules = _TF_ROOT / "modules"
    forbidden = ["eks", "msk", "clickhouse", "argocd", "airflow", "karpenter"]
    for mod in forbidden:
        assert not (modules / mod).is_dir(), (
            f"Old Product Ops module '{mod}' should not exist in Revenue Ops Terraform"
        )


def test_no_old_dev_env():
    old_dev = _TF_ROOT / "envs" / "dev"
    assert not old_dev.is_dir(), (
        "Old 'envs/dev' (Product Ops) env still present — should be revenue-dev"
    )

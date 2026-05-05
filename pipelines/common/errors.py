class RevenueOpsError(Exception):
    pass


class SourceNotAvailableError(RevenueOpsError):
    pass


class SchemaValidationError(RevenueOpsError):
    pass


class BronzeFileNotFoundError(RevenueOpsError):
    pass


class SilverTransformError(RevenueOpsError):
    pass


class GoldBuildError(RevenueOpsError):
    pass


class AnomalyDetectionError(RevenueOpsError):
    pass


class EvidenceLinkingError(RevenueOpsError):
    pass


class ActionMappingError(RevenueOpsError):
    pass


class PipelineStageError(RevenueOpsError):
    def __init__(self, stage: str, message: str):
        super().__init__(f"[{stage}] {message}")
        self.stage = stage

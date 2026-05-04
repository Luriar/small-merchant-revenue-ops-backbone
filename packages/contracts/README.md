# packages/contracts

Shared API and schema contracts will live here.

Current contents include the minimal change intake contract constants used by `apps/api`.
Event intake contract constants live here as well.
Issue intake contract constants live here too.
Retry action contract constants live here too.
Reprocess action contract constants live here too.
Trace create contract constants live here too.
The Aurora-backed `changes` repository reuses these existing change intake contracts without changing the handler shape.
The Aurora-backed `events` repository reuses the existing event intake contracts the same way.
The Aurora-backed `issues` repository reuses the existing issue intake contracts the same way.

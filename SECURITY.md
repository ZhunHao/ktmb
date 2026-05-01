# Security policy

## Supported versions

The latest released minor version on `main` is supported. Prior minors
are not patched.

## Reporting a vulnerability

Email zhunhaowong@gmail.com with subject prefix `[ktmb security]`.
Please do not file a public GitHub issue for security-sensitive
findings. We aim to respond within 7 days.

## Out of scope

- Misuse of the upstream `online.ktmb.com.my` booking site (not our
  property; report to KTMB directly).
- Issues in `data.gov.my` GTFS publication (report to MAMPU).
- Lack of authentication / rate-limiting on `ktmb-api` deployments —
  this library does not provide an auth layer; operators are
  responsible for fronting the bin with their own gateway.

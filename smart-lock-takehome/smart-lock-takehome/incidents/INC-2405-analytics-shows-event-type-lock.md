# INC-2405

The analytics warehouse shows every lock event in Q1 2026 with
`event_type = "lock"`.

Data team spot-checked raw MQTT topics in IoT Core and says the incoming topics
look normal. They also pulled a small EMF sample from the processor:

- Metrics sample: `artifacts/cloudwatch/metrics-emf-sample-2026-04-14.log`
- Matching raw topic sample: `artifacts/iot-core/metrics-crosscheck-2026-04-14.ndjson`

The warehouse is fed from processor output, not directly from IoT Core.
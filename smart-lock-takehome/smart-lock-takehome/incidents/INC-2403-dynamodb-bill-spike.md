# INC-2403

`MessageDeduplication-production` is now the single largest storage line item in
this IoT account. Storage growth is materially outpacing event growth.

Evidence attached:

- Table scan sample: `artifacts/dynamodb/message-dedup-scan-2026-04-02.json`
- TTL metric snapshot: `artifacts/cloudwatch/dedup-ttl-metrics-2026-04-02.txt`

The table's item count has been rising. No one recalls any manual
cleanup.

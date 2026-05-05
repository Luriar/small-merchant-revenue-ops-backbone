# M2-2 Stop Conditions Checklist

Stop immediately if any condition is true.

- [ ] publication contains FOR ALL TABLES
- [ ] publication contains FOR TABLES IN SCHEMA
- [ ] forbidden fields appear in publication/connector/message keys
- [ ] prod_change.payload appears in publication/connector/message keys
- [ ] prod_change.actor appears in publication/connector/message keys
- [ ] issue.title appears in connector/message keys
- [ ] issue.body appears in connector/message keys
- [ ] issue.payload appears in connector/message keys
- [ ] issue.reporter appears in connector/message keys
- [ ] connector uses publication.autocreate.mode=all_tables
- [ ] connector emits __op or __ts_ms instead of op and ts_ms
- [ ] Debezium envelope fields appear as ClickHouse data columns
- [ ] unbounded connector execution is required
- [ ] replication slot lag or WAL pressure grows unexpectedly
- [ ] anyone proposes REPLICA IDENTITY FULL as a quick fix without review

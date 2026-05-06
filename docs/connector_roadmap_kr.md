# Connector Roadmap

## Toss Place Official API

현재는 `TossPlaceClient` skeleton만 추가했다.

- secret은 source code에 저장하지 않는다.
- Secrets Manager reference를 사용한다.
- `fetchMerchants`, `fetchOrders`, `fetchPayments`는 공식 API credential 검토 후 구현한다.
- `transformTossOrderToRevenueFacts`는 revenue facts mapping 시작점이다.

## Baemin / Coupang Eats

로그인 자동화나 credential scraping은 하지 않는다.

허용 path:

- user-uploaded settlement CSV
- parser preset
- rejected row review
- reprocess job skeleton

## Naver

Naver Place scraping은 하지 않는다.

허용 path:

- review CSV upload parser
- official/search trend API signal if credentials and terms permit
- user-provided context signals

## Safety

POS/customer raw payload, card number, phone, customer name, exact customer address는 저장하지 않는다.

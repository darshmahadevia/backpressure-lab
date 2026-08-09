.PHONY: dev-api build-web check test test-race web-test web-typecheck web-build

dev-api:
	go run ./cmd/lab

build-web:
	cd web && npm run build

check: test test-race web-typecheck web-test web-build

test:
	go test ./...

test-race:
	go test -race ./...

web-test:
	cd web && npm test -- --run

web-typecheck:
	cd web && npm run typecheck

web-build:
	cd web && npm run build

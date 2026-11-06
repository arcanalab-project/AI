BICEP ?= bicep

.PHONY: test fmt bicep

test:
	go test ./...

fmt:
	gofmt -w .

bicep:
	$(BICEP) build infra/main.bicep --outfile packaging/marketplace/mainTemplate.json

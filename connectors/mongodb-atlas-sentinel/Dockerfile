FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/atlas-sentinel-ingest ./cmd/atlas-sentinel-ingest \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/atlas-sentinel-token-publisher ./cmd/atlas-sentinel-token-publisher

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/atlas-sentinel-ingest /atlas-sentinel-ingest
COPY --from=build /out/atlas-sentinel-token-publisher /atlas-sentinel-token-publisher
USER nonroot:nonroot
EXPOSE 8443 8080
ENTRYPOINT ["/atlas-sentinel-ingest"]

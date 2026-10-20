FROM rust:1.94.1-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY vendor ./vendor
COPY src ./src
RUN cargo build --locked --release
FROM debian:bookworm-slim
RUN useradd --system --uid 10001 solver
COPY --from=build /src/target/release/solver-worker /usr/local/bin/solver-worker
COPY vendor/min2phase/LICENSE /usr/share/licenses/solver/min2phase-LICENSE
USER 10001
EXPOSE 8081
CMD ["solver-worker"]

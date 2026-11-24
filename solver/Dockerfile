# syntax=docker/dockerfile:1
# Local builds prepare tables; CI overrides this with a pinned published base.
ARG SOLVER_TABLES_IMAGE=nxn-tables

FROM python:3.13-slim-bookworm AS nxn-tables
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev git ca-certificates libgcc-s1 && rm -rf /var/lib/apt/lists/*
ARG NXN_REVISION=6c9663d95bc81aadfdc069397902e0b9a163c705
RUN git init /opt/nxn-engine && cd /opt/nxn-engine && git remote add origin https://github.com/dwalton76/rubiks-cube-NxNxN-solver.git && git fetch --depth 1 origin "$NXN_REVISION" && git checkout --detach FETCH_HEAD && rm -rf .git
WORKDIR /opt/nxn-engine
RUN gcc -O3 -o ida_search_via_graph rubikscubennnsolver/ida_search_core.c rubikscubennnsolver/rotate_xxx.c rubikscubennnsolver/ida_search_666.c rubikscubennnsolver/ida_search_777.c rubikscubennnsolver/ida_search_via_graph.c -lm
RUN apt-get purge -y --auto-remove gcc libc6-dev git && rm -rf /var/lib/apt/lists/*
COPY nxn/prepare.py nxn/tables.json /opt/nxn/
RUN python /opt/nxn/prepare.py

FROM rust:1.94.1-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY vendor ./vendor
COPY src ./src
RUN cargo build --locked --release

# The tables stage is skipped when CI supplies SOLVER_TABLES_IMAGE.
# A legacy runtime may seed the first base; isolate its old application files.
FROM ${SOLVER_TABLES_IMAGE} AS runtime
# Linked copies let BuildKit reuse the large remote table layers without
# downloading them merely to add application files. Use a new runtime directory
# so a legacy image used to seed the first table base cannot leave active code.
COPY --link --from=build /src/target/release/solver-worker /usr/local/bin/solver-worker
COPY --link nxn /opt/cube-solver/nxn
COPY --link vendor/min2phase/LICENSE /usr/share/licenses/solver/min2phase-LICENSE
COPY --link nxn/NOTICE /usr/share/licenses/solver/NxN-NOTICE
COPY --link --chmod=755 nxn/kociemba /usr/local/bin/kociemba
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001
EXPOSE 8081
CMD ["python", "/opt/cube-solver/nxn/worker.py"]

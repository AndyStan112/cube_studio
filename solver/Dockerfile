FROM rust:1.94.1-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY vendor ./vendor
COPY src ./src
RUN cargo build --locked --release
FROM python:3.13-slim-bookworm AS nxn
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev git ca-certificates libgcc-s1 && rm -rf /var/lib/apt/lists/*
ARG NXN_REVISION=6c9663d95bc81aadfdc069397902e0b9a163c705
RUN git init /opt/nxn-engine && cd /opt/nxn-engine && git remote add origin https://github.com/dwalton76/rubiks-cube-NxNxN-solver.git && git fetch --depth 1 origin "$NXN_REVISION" && git checkout --detach FETCH_HEAD && rm -rf .git
WORKDIR /opt/nxn-engine
RUN gcc -O3 -o ida_search_via_graph rubikscubennnsolver/ida_search_core.c rubikscubennnsolver/rotate_xxx.c rubikscubennnsolver/ida_search_666.c rubikscubennnsolver/ida_search_777.c rubikscubennnsolver/ida_search_via_graph.c -lm
RUN apt-get purge -y --auto-remove gcc libc6-dev git && rm -rf /var/lib/apt/lists/*
COPY nxn/prepare.py nxn/tables.json /opt/nxn/
RUN python /opt/nxn/prepare.py

# Inherit the table layer so building the runtime image does not copy 6.3 GiB again.
FROM nxn
RUN useradd --system --uid 10001 solver
COPY --from=build /src/target/release/solver-worker /usr/local/bin/solver-worker
COPY nxn /opt/nxn
COPY vendor/min2phase/LICENSE /usr/share/licenses/solver/min2phase-LICENSE
COPY nxn/NOTICE /usr/share/licenses/solver/NxN-NOTICE
COPY nxn/kociemba /usr/local/bin/kociemba
RUN chmod 755 /usr/local/bin/kociemba
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001
EXPOSE 8081
CMD ["python", "/opt/nxn/worker.py"]

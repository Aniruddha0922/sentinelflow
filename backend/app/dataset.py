"""Synthetic flow generator for a repeatable teaching benchmark, NOT real traffic.

Distributions intentionally overlap. Ground-truth labels come from the generating
scenario; they are never model inputs. This cannot establish real-world efficacy.
"""

import numpy as np

from .schemas import LABELS, Flow


def generate_flows(count: int, seed: int = 42) -> tuple[list[Flow], list[str]]:
    rng = np.random.default_rng(seed)
    labels = rng.choice(LABELS, size=count, p=[0.55, 0.16, 0.14, 0.15]).tolist()
    flows: list[Flow] = []
    for label in labels:
        duration = rng.lognormal(6.4, 1.3)
        packets = int(rng.lognormal(3.6, 1.2)) + 1
        failed = int(rng.poisson(0.4))
        destinations = int(rng.poisson(1.5)) + 1
        syn = float(rng.beta(1.3, 8))
        protocol = str(rng.choice(["TCP", "UDP", "ICMP"], p=[0.78, 0.19, 0.03]))
        destination_port = int(rng.choice([22, 53, 80, 443, 8080, 3306]))
        mean_packet_bytes = rng.uniform(100, 1300)

        if label == "port_scan":
            destinations = int(rng.lognormal(3.9, 0.95)) + 1
            syn = float(rng.beta(6, 2))
            duration = rng.lognormal(5.4, 1.3)
            packets = int(destinations * rng.uniform(0.8, 3)) + 1
            mean_packet_bytes = rng.uniform(40, 180)
            destination_port = int(rng.integers(1, 65536))
            protocol = str(rng.choice(["TCP", "UDP"], p=[0.9, 0.1]))
        elif label == "brute_force":
            failed = int(rng.lognormal(2.7, 1.0)) + 1
            packets = int(rng.lognormal(5.1, 1.0)) + 1
            duration = rng.lognormal(8.8, 1.1)
            destination_port = int(rng.choice([22, 21, 3389, 443, 8080]))
            protocol = "TCP"
            syn = float(rng.beta(2, 6))
        elif label == "dos":
            packets = int(rng.lognormal(8.0, 1.3)) + 1
            duration = rng.lognormal(5.8, 1.3)
            syn = float(rng.beta(5, 2.5))
            mean_packet_bytes = rng.uniform(40, 400)
            protocol = str(rng.choice(["TCP", "UDP", "ICMP"], p=[0.6, 0.3, 0.1]))
        elif rng.random() < 0.13:
            # Benign high-volume backups, automated health checks and mistyped passwords.
            packets *= int(rng.integers(4, 35))
            destinations += int(rng.integers(2, 25))
            failed += int(rng.integers(0, 6))
            syn = float(rng.beta(3, 4))

        packets = min(packets, 10_000_000)
        flows.append(
            Flow(
                duration_ms=round(float(np.clip(duration, 0, 3_600_000)), 3),
                packets=packets,
                bytes_transferred=min(int(packets * mean_packet_bytes), 1_000_000_000_000),
                src_port=int(rng.integers(1024, 65536)),
                dst_port=destination_port,
                failed_logins=min(failed, 100_000),
                unique_dest_ports=min(destinations, 65_535),
                syn_ratio=round(syn, 5) if protocol == "TCP" else 0.0,
                protocol=protocol,
            )
        )
    return flows, labels

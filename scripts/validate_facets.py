#!/usr/bin/env python3
"""Check that facet data follows the rules in data/facets.config.json and data/schemas/facet.schema.json.

Checks: every registered facet has a methodology entry and is in at least one lens; every lens and methodology entry
names a registered facet; every facet record validates against the schema (status values, citations with https URLs
and ISO dates, dispute links for disputed facets); no facet still carries the retired verified flag; no record sits
on an unknown element. A config facet with a "source" is modular: its records live in that JSON file, which must
name the same facet_id, use only real element symbols, and validate against the same schema. Needs the jsonschema package.
"""

import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator

ROOT = Path(__file__).resolve().parent.parent
ELEMENTS = ROOT / "data" / "elements.json"
CONFIG = ROOT / "data" / "facets.config.json"
SCHEMA = ROOT / "data" / "schemas" / "facet.schema.json"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    errors = []
    data = load(ELEMENTS)
    config = load(CONFIG)
    validator = Draft7Validator(load(SCHEMA))

    registered = {f["key"] for f in data["facets"]}
    modular = {f["id"]: f for f in config["facets"] if "source" in f}
    # A modular facet is registered by its config entry, even though it is not in the elements.json registry.
    known = registered | set(modular)
    configured = {f["id"] for f in config["facets"]}
    lensed = {fid for lens in config["lenses"] for fid in lens["facets"]}
    symbols = {e["symbol"] for e in data["elements"]}

    for fid in sorted(registered - configured):
        errors.append(f"facet '{fid}' is registered in elements.json but has no entry in facets.config.json")
    for fid in sorted(configured - known):
        errors.append(f"facets.config.json names '{fid}', which is not registered in elements.json")
    for fid in sorted(configured - lensed):
        errors.append(f"facet '{fid}' is in no lens, so nothing shows it")
    for lens in config["lenses"]:
        for fid in lens["facets"]:
            if fid not in known:
                errors.append(f"lens '{lens['id']}' names unregistered facet '{fid}'")
    if config["default_lens"] not in {lens["id"] for lens in config["lenses"]}:
        errors.append(f"default_lens '{config['default_lens']}' is not a lens")

    for element in data["elements"]:
        for fid, record in element.get("facets", {}).items():
            where = f"{element['symbol']}.{fid}"
            if fid not in registered:
                errors.append(f"{where}: facet is not registered")
                continue
            if "verified" in record:
                errors.append(f"{where}: retired 'verified' flag present; use 'status'")
            for err in validator.iter_errors(record):
                location = "/".join(str(p) for p in err.path) or "<record>"
                errors.append(f"{where} [{location}]: {err.message}")
    for element in data["elements"]:
        if element["symbol"] not in symbols:
            errors.append(f"element {element.get('number')} has no symbol")

    for fid, entry in sorted(modular.items()):
        source = ROOT / entry["source"]
        where = f"{entry['source']}"
        try:
            facet_file = load(source)
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{where}: cannot load modular facet '{fid}': {exc}")
            continue
        if facet_file.get("facet_id") != fid:
            errors.append(f"{where}: facet_id is {facet_file.get('facet_id')!r}, expected {fid!r}")
        for symbol, record in facet_file.get("records", {}).items():
            here = f"{where} {symbol}"
            if symbol not in symbols:
                errors.append(f"{here}: symbol is not a known element")
                continue
            if "verified" in record:
                errors.append(f"{here}: retired 'verified' flag present; use 'status'")
            for err in validator.iter_errors(record):
                location = "/".join(str(p) for p in err.path) or "<record>"
                errors.append(f"{here} [{location}]: {err.message}")

    if errors:
        print("Facet validation FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print(f"OK: {len(known)} facets, {len(config['lenses'])} lenses, {len(data['elements'])} elements.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Small helper to inspect the Kanidm OpenAPI spec (throwaway dev tooling).

Usage:
  python3 docs/inspect_openapi.py paths <regex>
  python3 docs/inspect_openapi.py op /v1/person/{id} patch
  python3 docs/inspect_openapi.py schema #/components/schemas/Person
"""
import json
import sys

SPEC = "docs/kanidm-1.11.1-openapi.json"


def load():
    with open(SPEC) as f:
        return json.load(f)


def refname(ref):
    return ref.rsplit("/", 1)[-1] if ref else ref


def summarize_schema(s, depth=0):
    if not isinstance(s, dict):
        return str(s)
    if "$ref" in s:
        return refname(s["$ref"])
    t = s.get("type", "")
    if "items" in s:
        return f"{t}[{summarize_schema(s['items'], depth + 1)}]"
    if "properties" in s:
        props = ", ".join(f"{k}:{summarize_schema(v, depth + 1)}" for k, v in list(s["properties"].items())[:25])
        extra = f" (+{len(s['properties']) - 25} more)" if len(s["properties"]) > 25 else ""
        req = s.get("required", [])
        reqs = f" req=[{','.join(req[:15])}]" if req else ""
        return f"obj({props}){reqs}{extra}"
    if "anyOf" in s:
        return " | ".join(summarize_schema(x, depth + 1) for x in s["anyOf"])
    if "oneOf" in s:
        return " | ".join(summarize_schema(x, depth + 1) for x in s["oneOf"])
    if "enum" in s:
        return f"{t} enum={s['enum'][:8]}"
    if "format" in s:
        return f"{t}({s['format']})"
    if "description" in s and not t:
        return s["description"][:60]
    return t or "any"


def cmd_paths(regex):
    import re
    spec = load()
    for p in sorted(spec["paths"]):
        if re.search(regex, p):
            methods = ", ".join(m.upper() for m in spec["paths"][p] if m in ("get", "post", "put", "patch", "delete"))
            print(f"{p}: {methods}")


def cmd_op(path, method):
    spec = load()
    op = spec["paths"][path][method.lower()]
    print(f"== {method.upper()} {path}")
    print(f"summary: {op.get('summary')}")
    print(f"desc: {op.get('description', '')[:300]}")
    for p in op.get("parameters", []):
        req = "required" if p.get("required") else "optional"
        sch = summarize_schema(p.get("schema", {}))
        print(f"  param {p['in']}/{p['name']} [{req}] {sch}")
    rb = op.get("requestBody")
    if rb:
        for ct, c in rb["content"].items():
            print(f"  body ({ct}): {summarize_schema(c.get('schema', {}))}")
    for code, r in sorted(op.get("responses", {}).items()):
        desc = r.get("description", "")[:80]
        content = ""
        for ct, c in (r.get("content") or {}).items():
            content = f" <- {ct}: {summarize_schema(c.get('schema', {}))}"
        print(f"  {code} {desc}{content}")
    sec = op.get("security")
    if sec:
        print(f"  security: {sec}")


def cmd_schema(name):
    spec = load()
    key = name if name.startswith("#") else f"#/components/schemas/{name}"
    s = spec.get("components", {}).get("schemas", {}).get(key.split("/")[-1], {})
    print(f"== {key}")
    print(json.dumps(s, indent=2)[:4000])


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "paths":
        cmd_paths(sys.argv[2])
    elif cmd == "op":
        cmd_op(sys.argv[2], sys.argv[3])
    elif cmd == "schema":
        cmd_schema(sys.argv[2])

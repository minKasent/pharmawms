"""Print a compact summary of the backend OpenAPI contract (endpoints and schemas)."""
from __future__ import annotations

import json
import sys
import urllib.request

REF = "$ref"


def ref_name(schema: dict) -> str:
    if REF in schema:
        return schema[REF].split("/")[-1]
    if schema.get("type") == "array":
        return ref_name(schema.get("items", {})) + "[]"
    return schema.get("type", "")


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/v3/api-docs"
    with urllib.request.urlopen(url) as resp:
        spec = json.load(resp)
    for path, operations in spec["paths"].items():
        for method, operation in operations.items():
            query = ",".join(p["name"] for p in operation.get("parameters", []) if p["in"] == "query")
            body = operation.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {})
            status, response = next(iter(operation["responses"].items()))
            content = response.get("content", {})
            result = ref_name(next(iter(content.values())).get("schema", {})) if content else ""
            print(f"{method.upper():6} {path}{'?' + query if query else ''}"
                  f"{' body=' + ref_name(body) if body else ''} -> {status} {result}")
    print()
    for name, schema in spec["components"]["schemas"].items():
        fields = []
        required = set(schema.get("required", []))
        for field, prop in schema.get("properties", {}).items():
            kind = ref_name(prop) or prop.get("type", "?")
            if "enum" in prop:
                kind = "|".join(prop["enum"])
            elif prop.get("format"):
                kind += f"({prop['format']})"
            fields.append(f"{field}{'' if field in required else '?'}:{kind}")
        print(f"{name} {{{', '.join(fields)}}}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

// A raw backspace (0x08) once replaced "\b" in regex literals (written through a shell
// that expanded the escape), silently breaking every $TICKER question to Ask Riven.
// Control characters other than tab, newline and carriage return never belong in source.
const ROOTS = ["lib", "components", "app", "hooks"]
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "node_modules" || name === ".next" ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe("source hygiene", () => {
  test("no stray control characters in frontend source", () => {
    const bad = ROOTS.flatMap(sourceFiles).filter((f) => CONTROL.test(readFileSync(f, "utf8")))
    expect(bad).toEqual([])
  })
})

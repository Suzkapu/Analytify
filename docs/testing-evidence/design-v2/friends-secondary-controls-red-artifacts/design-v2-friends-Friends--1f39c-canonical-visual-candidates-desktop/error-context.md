# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends secondary content has deterministic canonical visual candidates
- Location: e2e/design-v2-friends.spec.ts:149:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 3
+ Received  + 3

  Array [
    Object {
-     "paddingLeft": 16,
-     "width": 181,
+     "paddingLeft": 8,
+     "width": 173,
    },
    Object {
      "paddingLeft": 8,
-     "width": 165,
+     "width": 173,
    },
  ]
```

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true })
Expected: "rgb(24, 32, 25)"
Received: "rgba(255, 116, 125, 0.12)"
Timeout:  5000ms

Call log:
  - Expect "soft toHaveCSS" locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true }) with timeout 5000ms
  - waiting for locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true })
    14 × locator resolved to <button type="button" v2button="danger" _ngcontent-ng-c1345351098="" class="v2-button v2-button--danger">…</button>
       - unexpected value "rgba(255, 116, 125, 0.12)"

```

```yaml
- button "Revoke"
```

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true })
Expected: "rgb(255, 116, 125)"
Received: "color(srgb 1 0.454902 0.490196 / 0.55)"
Timeout:  5000ms

Call log:
  - Expect "soft toHaveCSS" locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true }) with timeout 5000ms
  - waiting for locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true })
    14 × locator resolved to <button type="button" v2button="danger" _ngcontent-ng-c1345351098="" class="v2-button v2-button--danger">…</button>
       - unexpected value "color(srgb 1 0.454902 0.490196 / 0.55)"

```

```yaml
- button "Revoke"
```

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 4
+ Received  + 4

  Array [
    Object {
-     "paddingLeft": 16,
-     "width": 182,
+     "paddingLeft": 8,
+     "width": 166,
    },
    Object {
-     "paddingLeft": 8,
-     "width": 164,
+     "paddingLeft": 16,
+     "width": 180,
    },
  ]
```

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true })
Expected: "rgb(24, 32, 25)"
Received: "rgba(255, 116, 125, 0.12)"
Timeout:  5000ms

Call log:
  - Expect "soft toHaveCSS" locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true }) with timeout 5000ms
  - waiting for locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true })
    14 × locator resolved to <button type="button" v2button="danger" _ngcontent-ng-c1345351098="" class="v2-button v2-button--danger">…</button>
       - unexpected value "rgba(255, 116, 125, 0.12)"

```

```yaml
- button "Revoke"
```

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true })
Expected: "rgb(255, 116, 125)"
Received: "color(srgb 1 0.454902 0.490196 / 0.55)"
Timeout:  5000ms

Call log:
  - Expect "soft toHaveCSS" locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true }) with timeout 5000ms
  - waiting for locator('v2-friends-page').getByRole('button', { name: 'Revoke', exact: true })
    14 × locator resolved to <button type="button" v2button="danger" _ngcontent-ng-c1345351098="" class="v2-button v2-button--danger">…</button>
       - unexpected value "color(srgb 1 0.454902 0.490196 / 0.55)"

```

```yaml
- button "Revoke"
```

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 3
+ Received  + 3

  Array [
    Object {
-     "paddingLeft": 16,
-     "width": 181,
+     "paddingLeft": 8,
+     "width": 173,
    },
    Object {
      "paddingLeft": 8,
-     "width": 165,
+     "width": 173,
    },
  ]
```

```
Test timeout of 30000ms exceeded.
```
# Normalize repeated grouping tab IDs

## Problem statement

AI providers can return the same eligible tab ID more than once in a grouping
response. The validator currently rejects the entire response, preventing an
otherwise usable grouping operation.

## Accepted decision

Keep the first eligible occurrence of each tab ID in provider response order
and ignore every later occurrence. This guarantees that a tab is never applied
to more than one group while allowing grouping to continue.

The alternatives considered were retaining strict rejection and only
deduplicating within a group. Strict rejection leaves users exposed to routine
provider-output errors; partial deduplication does not resolve conflicting
cross-group assignments.

## Architecture and contract

`validateGroupingPlan` is the normalization boundary. Its existing global
`seenTabIds` set already records provider-order assignment. A repeated eligible
ID will skip the later assignment instead of throwing. Unknown IDs continue to
be ignored before duplicate tracking. Existing-group validation, normalized
group merging, and new-group singleton filtering remain unchanged.

## Implementation DAG

1. Replace the duplicate-ID rejection test in `src/core/grouping.test.ts` with
   assertions that cover both same-group and cross-group repeats, with the
   first eligible occurrence winning.
2. Run the focused test to establish that current behavior fails by throwing.
3. Update `src/core/grouping.ts` so a repeated eligible ID is skipped.
4. Run focused grouping and workflow tests, then the repository checks.

## Affected files

- `src/core/grouping.test.ts`
- `src/core/grouping.ts`

## Test strategy

The regression test will verify intra-group and cross-group duplicate IDs are
removed in provider order. Existing tests retain coverage for unknown IDs,
existing groups, group-name merging, and singleton filtering. Workflow tests
verify the validated plan still reaches the application boundary.

## Assumptions, risks, and rollback

Provider array order deterministically defines precedence when a tab is
proposed for competing groups. A later group can become a dropped singleton,
which is consistent with existing new-group rules. The change is isolated to
in-memory validation and can be rolled back by restoring duplicate rejection.

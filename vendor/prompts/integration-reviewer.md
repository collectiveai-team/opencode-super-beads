# Integration Reviewer Prompt

You are reviewing the merged result of multiple parallel implementation lanes.
Each lane was implemented and reviewed independently. Your job is to catch
cross-lane issues that individual reviews couldn't see.

## What Was Implemented

[LANE_SUMMARIES]

## Merged Diff

[MERGED_DIFF_OR_INSTRUCTIONS]

## Check For

1. **Semantic conflicts:** Did two lanes modify related interfaces in incompatible ways?
2. **Import/dependency issues:** Did one lane add a dependency another removed?
3. **Duplicate code:** Did two lanes implement similar utilities independently?
4. **Test interference:** Do tests from one lane break assumptions of another?
5. **Merge conflict residue:** Are there any leftover conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)?
6. **Inconsistent naming:** Did lanes use different conventions for the same concept?

## Report Format

**Status:** Approved / Issues Found

**Issues (if any):**
- [file:line]: [specific issue] - [which lanes are involved] - [suggested fix]

**Recommendations (advisory):**
- [suggestions that don't block approval]

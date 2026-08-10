# Responsibility Summary

`Semantic Code: Show Responsibility Summary` provides an on-demand distribution for the current analyzed file. Percentages are based on final, disjoint colored-line ownership—not overlapping AST ranges—so they sum to approximately 100% without double-counting nested regions.

The summary stays out of the editor until requested. Selecting an item activates that responsibility lens and reveals its first region, turning statistics into navigation rather than a dashboard. Unknown and below-threshold regions are excluded; percentages describe the visible semantic map, not every physical line in the file.

This is descriptive and advisory. It is not a quality score or an architectural-smell detector.


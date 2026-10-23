# CI controls

The candidate runtime must pass the full Jasmine suite on Linux, macOS and Windows. Native ZeroMQ checks and real kernel lifecycle checks also run on all three systems.

Linux additionally runs the complete original runtime and assertions from revision 48d61e99288a14df12f345d1c04525f68c8d3879. Its fixture adapter translates current editor lifecycle contracts without replacing the original implementation or relaxing its assertions. This is a negative control: its six Unicode offset regressions must still fail.

The current syntax owner can retire the cells service's synchronous cache while source analysis runs. The original runtime queries later cell boundaries after that analysis and consequently omits a later `%%bash` block. The live runtime now captures every cell boundary before analysis begins. The control copies the current typed-source specs, retaining every original case and adding the regression that deliberately retires the cache during analysis. That case must fail on the original implementation because it omits the later magic. The unchanged empty-cell case remains in the control; the missing-magic check no longer depends on incidental parser scheduling.

The control checker requires all 1215 original specs plus the added cache-retirement case, exactly the seven full failed test names, test exit status 1, a matching 1216-spec summary, and the exact missing-magic assertion message. A different error, an additional failure, a missing expected regression or a passing original runtime fails CI. The candidate suite always requires zero failures.

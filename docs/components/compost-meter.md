# compost-meter

`compost-meter` is a read-only mono or multichannel level display. The caller
supplies already-computed values; Compost does not analyse audio, apply
ballistics, decide what counts as clipping, or assign meanings such as peak,
RMS, or LUFS.

```html
<compost-meter label="Output" min="-90" max="12" curve="gain"></compost-meter>
<script>
  document.querySelector('compost-meter').setState({
    primaryLabel: 'Peak',
    secondaryLabel: 'Average',
    holdLabel: 'Hold',
    unit: 'dBFS',
    channels: [
      { label: 'L', primary: -12, secondary: -20, peak: -8, clipped: false },
      { label: 'R', primary: -9, secondary: -18, peak: -6, clipped: true },
    ],
  });
</script>
```

Each channel may supply `primary`, `secondary`, `peak`, `over`, and `clipped`.
The labels and values are independent: use the layers for whatever measurements
the application presents. `over` is a level rendered above zero in the alert
colour; `over: true` uses the primary level. `clipped` controls the clip mark.

Use the same `min`, `max`, `mid`, `curve`, and `shape` as a control to align
their value positions. The default lane gap is zero. Styling hooks include
`--meter-width`, `--meter-length`, `--meter-gap`, `--meter-primary-width`,
the colour variables, and the `panel`, `label`, `legend`, `meter`, `lane`,
`primary`, `secondary`, `over`, `peak`, `clip`, and `channel-labels` parts.

import { useState } from "react";
import { normalizeColor, RULES } from "@/drawing/model";
type Props = {
  color: string;
  width: number;
  recent: string[];
  disabled: boolean;
  onColor: (color: string) => void;
  onWidth: (width: number) => void;
  onSample: () => void;
};
export default function StrokeOptions({
  color,
  width,
  recent,
  disabled,
  onColor,
  onWidth,
  onSample,
}: Props) {
  const [hex, setHex] = useState<string | null>(null);
  const invalid = hex !== null && !normalizeColor(hex);
  return (
    <fieldset disabled={disabled}>
      <legend>MAKE IT YOURS</legend>
      <label htmlFor="hex">Stroke color</label>
      <div className="color-row">
        <input
          type="color"
          aria-label="Choose stroke color"
          value={color}
          onChange={(e) => {
            onColor(e.target.value);
            setHex(null);
          }}
        />
        <input
          id="hex"
          value={hex ?? color}
          maxLength={7}
          aria-invalid={!!invalid}
          aria-describedby={invalid ? "hex-error" : undefined}
          onChange={(e) => {
            setHex(e.target.value);
            if (normalizeColor(e.target.value)) onColor(e.target.value);
          }}
          onBlur={() => {
            if (!invalid) setHex(null);
          }}
        />
      </div>
      {invalid && (
        <small id="hex-error" className="error">
          Use six hex digits, such as #235C4B. Your last valid color is kept.
        </small>
      )}
      <button
        className="sample"
        onClick={() => {
          setHex(null);
          onSample();
        }}
      >
        ⌖ Pick Color From Canvas
      </button>
      <label>Recent colors</label>
      <div className="swatches">
        {recent.length ? (
          recent.map((c) => (
            <button
              key={c}
              aria-label={`Use ${c}`}
              title={c}
              style={{ background: c }}
              onClick={() => {
                onColor(c);
                setHex(null);
              }}
            />
          ))
        ) : (
          <small>Your used colors will appear here.</small>
        )}
      </div>
      <label htmlFor="brush">Brush width</label>
      <select
        id="brush"
        value={width}
        onChange={(e) => onWidth(Number(e.target.value))}
      >
        {RULES.widths.map((w, i) => (
          <option key={w} value={w}>
            {["Thin", "Medium", "Thick"][i]} · {w} units
          </option>
        ))}
      </select>
    </fieldset>
  );
}

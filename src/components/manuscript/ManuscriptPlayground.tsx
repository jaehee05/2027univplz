"use client";

import { useState } from "react";

import { ManuscriptEditor } from "@/components/manuscript/ManuscriptEditor";
import { DEFAULT_SPEC, DEFAULT_TOLERANCE, type ManuscriptSpec } from "@/lib/manuscript/spec";

const SAMPLE = `제시문 (가)는 개인의 자유를 사회 질서보다 앞세운다. 이는 국가의 개입을 최소화할 때 비로소 개인이 자기 삶의 주인이 된다는 판단에 근거한다.
반면 (나)는 공동체가 합의한 규범이 개인의 선택에 앞선다고 본다. 1948년 이후 축적된 제도적 경험이 그 근거다. "질서 없는 자유는 강자의 자유일 뿐"이라는 지적은 이 입장을 압축한다.`;

export function ManuscriptPlayground() {
  const [text, setText] = useState(SAMPLE);
  const [cols, setCols] = useState(DEFAULT_SPEC.cols);
  const [labelCells, setLabelCells] = useState(DEFAULT_SPEC.labelCells);
  const [target, setTarget] = useState(600);
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE);

  const spec: ManuscriptSpec = { ...DEFAULT_SPEC, cols, labelCells };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <label className="flex items-center gap-2">
          한 줄 칸 수
          <input
            type="number"
            min={10}
            max={60}
            value={cols}
            onChange={(event) => setCols(Number(event.target.value) || DEFAULT_SPEC.cols)}
            className="w-20 rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2">
          라벨 칸
          <input
            type="number"
            min={0}
            max={10}
            value={labelCells}
            onChange={(event) => setLabelCells(Number(event.target.value) || 0)}
            className="w-16 rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2">
          목표 글자 수
          <input
            type="number"
            min={50}
            max={3000}
            step={50}
            value={target}
            onChange={(event) => setTarget(Number(event.target.value) || 600)}
            className="w-24 rounded border border-neutral-300 px-2 py-1"
          />
          자 내외
        </label>
        <label className="flex items-center gap-2">
          허용 폭
          <select
            value={tolerance}
            onChange={(event) => setTolerance(Number(event.target.value))}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            <option value={0.05}>±5%</option>
            <option value={0.1}>±10%</option>
            <option value={0.15}>±15%</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setText(SAMPLE)}
          className="rounded border border-neutral-300 px-3 py-1"
        >
          예시 답안 되돌리기
        </button>
        <button
          type="button"
          onClick={() => setText("")}
          className="rounded border border-neutral-300 px-3 py-1"
        >
          비우기
        </button>
      </div>

      <ManuscriptEditor
        value={text}
        onChange={setText}
        spec={spec}
        lengthRule={{ target, tolerance }}
        label="문제 1-1"
      />
    </div>
  );
}

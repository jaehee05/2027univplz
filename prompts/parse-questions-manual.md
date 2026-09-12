---

## 답을 돌려주는 방법

아래 형식의 **JSON 하나만** 출력해라. 설명이나 인사말을 앞뒤에 붙이지 말고,
코드 블록으로 감싸도 된다. 한국어로 쓴다.

```json
{
  "questions": [
    {
      "number": "1",
      "prompt": "논제 문장 전문",
      "passages": [{ "label": "가", "text": "제시문 전문" }],
      "charTarget": 600,
      "charMin": null,
      "charMax": null,
      "lengthNote": "600자 내외",
      "points": 30,
      "answerFormat": "manuscript"
    }
  ],
  "note": "바로잡은 곳 · 확인이 필요한 곳. 없으면 빈 문자열"
}
```

### 반드시 지킬 것

- `prompt` 와 `passages[].text` 는 문제지에 적힌 **글자 그대로** 옮긴다. 줄이거나 다듬지 마라.
- `charTarget` · `lengthNote` · `points` 는 없으면 `null` 이다. 지어내지 마라.
- `charMin` · `charMax` 는 **문제지가 범위를 못 박았을 때만** 채운다.
  `(800±100자)` → charTarget 800, charMin 700, charMax 900.
  `600자 내외` 처럼 목표만 있으면 둘 다 `null` 로 둔다.
- `answerFormat` 은 `"manuscript"` 또는 `"free"` 둘 중 하나다.
- 문항을 하나도 못 찾겠으면 `questions` 를 빈 배열로 두고 `note` 에 이유를 적는다.
- 문항이 여럿이면 **하나도 빼지 말고** 문제지에 나온 차례대로 모두 넣는다.
- 위 「글자가 깨진 곳」에서 바로잡은 것과 확인이 필요한 것을 `note` 에 줄바꿈으로 나눠 적는다.
  선생님이 그 자리만 보고 고칠 수 있게, 몇 번 문항 · 어느 제시문인지 밝힌다.

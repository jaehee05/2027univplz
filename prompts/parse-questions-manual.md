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
      "lengthNote": "600자 내외 (±10%)",
      "points": 30,
      "answerFormat": "manuscript"
    }
  ],
  "note": "파싱하며 걸린 점. 없으면 빈 문자열"
}
```

### 반드시 지킬 것

- `prompt` 와 `passages[].text` 는 문제지에 적힌 **글자 그대로** 옮긴다. 줄이거나 다듬지 마라.
- `charTarget` · `lengthNote` · `points` 는 없으면 `null` 이다. 지어내지 마라.
- `answerFormat` 은 `"manuscript"` 또는 `"free"` 둘 중 하나다.
- 문항을 하나도 못 찾겠으면 `questions` 를 빈 배열로 두고 `note` 에 이유를 적는다.

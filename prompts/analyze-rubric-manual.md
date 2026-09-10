---

## 답을 돌려주는 방법

아래 형식의 **JSON 하나만** 출력해라. 설명이나 인사말을 앞뒤에 붙이지 말고,
코드 블록으로 감싸도 된다. 한국어로 쓴다.

```json
{
  "questionTypes": [
    { "name": "유형 이름", "description": "설명", "cues": ["비교하시오", "평가하시오"] }
  ],
  "rubric": {
    "items": [
      {
        "questionNumber": "1",
        "name": "항목 이름",
        "points": 30,
        "description": "무엇을 보는 항목인지. 첫 문장에 해설의 원래 배점을 적는다",
        "criteria": ["만점 조건 2~4개"],
        "inferred": false
      }
    ],
    "deductions": [
      { "name": "감점 사유", "points": 5, "description": "설명", "inferred": false }
    ]
  },
  "answerStyle": {
    "structure": "문단 구성",
    "tone": "문체",
    "avoid": ["이 대학에서 특히 감점되는 습관"]
  },
  "modelAnswerPatterns": ["모범답안에서 반복되는 서술 방식"]
}
```

### 반드시 지킬 것

- **문항마다 배점 합계가 정확히 100** 이어야 한다. 전체 합이 아니라 문항별로 100이다.
  `questionNumber` 를 빠짐없이 채우고, 배점은 모두 정수로 쓴다.
- 해설에 그대로 적힌 항목은 `inferred: false`, 모범답안에서 추론한 항목은 `inferred: true` 다.
  이 구분이 틀리면 안 된다.
- 감점할 것이 없으면 `deductions` 는 빈 배열로 둔다.

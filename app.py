from pathlib import Path
import re

from flask import Flask, jsonify, request


BASE_DIR = Path(__file__).resolve().parent
KNOWLEDGE_FILE = BASE_DIR / "knowledge.txt"

app = Flask(__name__, static_folder=".", static_url_path="")


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/")
def home():
    return app.send_static_file("index.html")


def load_knowledge_paragraphs():
    if not KNOWLEDGE_FILE.exists():
        return []

    content = KNOWLEDGE_FILE.read_text(encoding="utf-8")
    return [block.strip() for block in re.split(r"\n\s*\n", content) if block.strip()]


def build_keywords(question):
    keywords = set()
    lower_question = question.lower()

    english_words = re.findall(r"[a-z0-9][a-z0-9_-]*", lower_question)
    keywords.update(word for word in english_words if len(word) >= 2)

    chinese_parts = re.findall(r"[\u4e00-\u9fff]{2,}", question)
    for part in chinese_parts:
        if len(part) <= 4:
            keywords.add(part)

        for size in (2, 3, 4):
            if len(part) < size:
                continue
            for index in range(len(part) - size + 1):
                keywords.add(part[index:index + size])

    keyword_hints = {
        "学习": ["学了", "学习", "学什么", "内容"],
        "网站": ["网站", "网页", "页面"],
        "搭建": ["怎么做", "怎么搭建", "做出来", "开发"],
        "提示词": ["提示词", "prompt"],
        "工作流": ["工作流"],
        "图片": ["图片", "做图"],
        "视频": ["视频"],
        "复盘": ["复盘", "总结"],
        "下一步": ["下一步", "接下来", "之后"],
        "计划": ["计划", "准备做什么"],
        "接口": ["接口", "接入"],
        "ai": ["ai", "人工智能"],
    }

    for keyword, triggers in keyword_hints.items():
        if any(trigger in lower_question for trigger in triggers):
            keywords.add(keyword)

    stopwords = {
        "请问", "一下", "一个", "这个", "那个", "什么", "怎么", "如何",
        "可以", "一下", "一下子", "问题", "你的", "我的", "你们",
        "我们", "他们", "是不是", "有没有", "为什么", "然后", "现在",
    }

    return [keyword for keyword in keywords if keyword not in stopwords]


def score_paragraph(question, keywords, paragraph):
    score = 0
    hits = []
    paragraph_lower = paragraph.lower()

    for keyword in keywords:
        if keyword in paragraph_lower:
            hits.append(keyword)
            score += len(keyword) * 2

    cleaned_question = re.sub(r"\s+", "", question)
    cleaned_paragraph = re.sub(r"\s+", "", paragraph)

    if cleaned_question and cleaned_question in cleaned_paragraph:
        score += 12

    shared_chars = set(cleaned_question) & set(cleaned_paragraph)
    score += len(shared_chars)

    return score, hits


def search_relevant_paragraphs(question, top_k=3):
    paragraphs = load_knowledge_paragraphs()
    keywords = build_keywords(question)
    scored_results = []

    for paragraph in paragraphs:
        score, hits = score_paragraph(question, keywords, paragraph)
        if score > 0:
            scored_results.append(
                {
                    "text": paragraph,
                    "score": score,
                    "hits": sorted(set(hits)),
                }
            )

    scored_results.sort(key=lambda item: item["score"], reverse=True)

    if scored_results:
        return scored_results[:top_k]

    fallback_results = [{"text": paragraph, "score": 0, "hits": []} for paragraph in paragraphs[:top_k]]
    return fallback_results


def build_prompt(question, relevant_items):
    knowledge_text = "\n\n".join(
        f"知识片段 {index + 1}：\n{item['text']}"
        for index, item in enumerate(relevant_items)
    )

    return (
        "你是“阿柏的AI学习助手”。\n"
        "请优先根据知识库内容回答，语言自然、清晰、适合新手理解。\n"
        "如果知识库信息不够，请明确说明“当前知识库里没有更详细的信息”，不要编造。\n\n"
        f"知识库内容：\n{knowledge_text}\n\n"
        f"用户问题：{question}\n\n"
        "请输出一段简洁、友好的中文回答。"
    )


def call_model_api(prompt):
    """
    这里先预留真实大模型接口的位置。
    后续如果你要接真实模型，可以把 prompt 发给模型接口，再把模型返回的 answer 返回出去。
    当前返回 None，表示先走下面的模拟回答逻辑。
    """

    # 示例（后续接真实模型时再打开）：
    # import requests
    # response = requests.post(
    #     "你的模型接口地址",
    #     headers={"Authorization": "Bearer 你的Key"},
    #     json={"prompt": prompt},
    #     timeout=30,
    # )
    # return response.json()["answer"]

    return None


def build_mock_answer(question, relevant_items):
    if not relevant_items:
        return (
            "我暂时没有在 knowledge.txt 里找到合适的内容。"
            "你可以换一个更具体的问题，比如“你学了哪些内容”或“这个网站是怎么做出来的”。"
        )

    top_items = [item["text"] for item in relevant_items[:2]]
    answer_parts = ["根据我目前整理的学习内容，我可以这样回答你："]
    answer_parts.extend(top_items)

    if not any(item["score"] > 0 for item in relevant_items):
        answer_parts.append("这次是基于知识库前几段内容给出的兜底回答，说明你的问题还可以再问得更具体一些。")
    else:
        answer_parts.append("你还有什么想问的呢")

    return "\n\n".join(answer_parts)


@app.route("/api/ask", methods=["POST", "OPTIONS"])
def ask():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    question = str(data.get("question", "")).strip()

    if not question:
        return jsonify({"error": "问题不能为空"}), 400

    relevant_items = search_relevant_paragraphs(question, top_k=3)
    prompt = build_prompt(question, relevant_items)
    model_answer = call_model_api(prompt)
    answer = model_answer or build_mock_answer(question, relevant_items)

    return jsonify(
        {
            "question": question,
            "answer": answer,
            "used_mock": model_answer is None,
            "matched_knowledge": [item["text"] for item in relevant_items],
            "keywords": build_keywords(question),
            "prompt_preview": prompt,
        }
    )


if __name__ == "__main__":
    app.run(debug=True)

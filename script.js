document.addEventListener("DOMContentLoaded", () => {
  initPageEntrance();
  initRevealAnimation();
  initReviewCards();
  initReviewMedia();
  initQaChat();
});

function initPageEntrance() {
  window.setTimeout(() => {
    document.body.classList.add("page-loaded");
  }, 60);
}

function initRevealAnimation() {
  const revealItems = document.querySelectorAll(".reveal");

  if (!revealItems.length) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.16
    }
  );

  revealItems.forEach((item) => {
    observer.observe(item);
  });
}

function initReviewCards() {
  const cards = document.querySelectorAll(".expandable-card");

  if (!cards.length) {
    return;
  }

  cards.forEach((card) => {
    const button = card.querySelector(".review-toggle");
    const detail = card.querySelector(".review-detail");
    const actionText = card.querySelector(".review-toggle-action");

    if (!button || !detail) {
      return;
    }

    closeReviewCard(card, detail, button, actionText);

    button.addEventListener("click", () => {
      const isOpen = card.classList.contains("is-open");

      if (isOpen) {
        closeReviewCard(card, detail, button, actionText);
        return;
      }

      openReviewCard(card, detail, button, actionText);
    });
  });

  window.addEventListener("resize", refreshOpenReviewCards);
}

function openReviewCard(card, detail, button, actionText) {
  card.classList.add("is-open");
  button.setAttribute("aria-expanded", "true");
  detail.style.maxHeight = detail.scrollHeight + "px";

  if (actionText) {
    actionText.textContent = "点击收起";
  }
}

function closeReviewCard(card, detail, button, actionText) {
  card.classList.remove("is-open");
  button.setAttribute("aria-expanded", "false");
  detail.style.maxHeight = "0px";

  if (actionText) {
    actionText.textContent = "点击展开";
  }
}

function refreshOpenReviewCards() {
  const details = document.querySelectorAll(".expandable-card.is-open .review-detail");

  details.forEach((detail) => {
    detail.style.maxHeight = detail.scrollHeight + "px";
  });
}

function initReviewMedia() {
  const mediaItems = document.querySelectorAll(".showcase-media");

  mediaItems.forEach((media) => {
    const image = media.querySelector(".showcase-image");

    if (!image) {
      media.classList.add("is-empty");
      return;
    }

    if (image.complete && image.naturalWidth === 0) {
      media.classList.add("is-empty");
      return;
    }

    image.addEventListener("load", refreshOpenReviewCards);

    image.addEventListener("error", () => {
      media.classList.add("is-empty");
      refreshOpenReviewCards();
    });
  });
}

function initQaChat() {
  const messagesContainer = document.querySelector("#chatMessages");
  const input = document.querySelector("#questionInput");
  const sendButton = document.querySelector("#askButton");
  const presetButtons = document.querySelectorAll(".preset-question");
  const apiUrl =
    window.location.protocol === "file:"
      ? "http://127.0.0.1:5000/api/ask"
      : "/api/ask";

  if (!messagesContainer || !input || !sendButton) {
    return;
  }

  let isReplying = false;

  autoResizeInput(input);

  input.addEventListener("input", () => {
    autoResizeInput(input);
  });

  sendButton.addEventListener("click", () => {
    sendMessage(input.value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input.value);
    }
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (isReplying) {
        return;
      }

      sendMessage(button.textContent.trim());
    });
  });

  async function sendMessage(rawText) {
    const question = rawText.trim();

    if (!question || isReplying) {
      if (!question) {
        input.focus();
      }
      return;
    }

    isReplying = true;
    setComposerState(true, sendButton, input);
    hideChatHelper(messagesContainer);

    appendMessage(messagesContainer, "user", question, "我");
    input.value = "";
    autoResizeInput(input);
    autoScrollMessages(messagesContainer);

    const thinkingMessage = appendThinkingMessage(messagesContainer);
    autoScrollMessages(messagesContainer);

    try {
      const reply = await fetchAnswer(apiUrl, question);
      const bubble = thinkingMessage ? thinkingMessage.querySelector(".message-bubble") : null;

      if (!bubble) {
        isReplying = false;
        setComposerState(false, sendButton, input);
        return;
      }

      thinkingMessage.classList.remove("message-thinking");
      bubble.textContent = "";

      typeText(
        bubble,
        reply,
        20,
        () => {
          autoScrollMessages(messagesContainer);
        },
        () => {
          isReplying = false;
          setComposerState(false, sendButton, input);
        }
      );
    } catch (error) {
      const bubble = thinkingMessage ? thinkingMessage.querySelector(".message-bubble") : null;

      if (bubble) {
        thinkingMessage.classList.remove("message-thinking");
        bubble.textContent = "暂时连接不到后端，请先运行 Flask 服务，再重新提问。";
      }

      isReplying = false;
      setComposerState(false, sendButton, input);
      autoScrollMessages(messagesContainer);
      console.error(error);
    }
  }
}

async function fetchAnswer(apiUrl, question) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "后端请求失败");
  }

  return data.answer || "后端暂时没有返回回答内容。";
}

function appendThinkingMessage(container) {
  const message = createMessageShell("ai", "阿柏的学习助手");
  message.classList.add("message-thinking");

  const bubble = message.querySelector(".message-bubble");
  bubble.innerHTML = 'AI 正在整理回答...<span class="thinking-dots"><span></span><span></span><span></span></span>';

  container.appendChild(message);
  animateNewMessage(message);
  return message;
}

function appendMessage(container, type, text, metaText) {
  const message = createMessageShell(type, metaText);
  const bubble = message.querySelector(".message-bubble");

  bubble.textContent = text;
  container.appendChild(message);
  animateNewMessage(message);
  return message;
}

function createMessageShell(type, metaText) {
  const message = document.createElement("div");
  message.className = "message";
  message.classList.add(type === "user" ? "message-user" : "message-ai");

  const content = document.createElement("div");
  content.className = "message-content";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = metaText;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  content.appendChild(meta);
  content.appendChild(bubble);
  message.appendChild(content);

  return message;
}

function animateNewMessage(message) {
  message.classList.add("is-entering");

  window.setTimeout(() => {
    message.classList.remove("is-entering");
  }, 320);
}

function hideChatHelper(container) {
  container.classList.add("has-conversation");
}

function typeText(element, text, speed, onStep, onComplete) {
  let index = 0;

  const timer = window.setInterval(() => {
    element.textContent += text.charAt(index);
    index += 1;

    if (typeof onStep === "function") {
      onStep();
    }

    if (index >= text.length) {
      window.clearInterval(timer);

      if (typeof onComplete === "function") {
        onComplete();
      }
    }
  }, speed);
}

function setComposerState(isDisabled, sendButton, input) {
  sendButton.disabled = isDisabled;
  input.disabled = isDisabled;
  sendButton.textContent = isDisabled ? "整理中..." : "发送";

  if (!isDisabled) {
    input.focus();
  }
}

function autoScrollMessages(container) {
  container.scrollTop = container.scrollHeight;
}

function autoResizeInput(input) {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 130) + "px";
}

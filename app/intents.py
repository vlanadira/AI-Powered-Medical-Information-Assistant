import re


def basic_conversation_reply(message: str) -> str | None:
    normalized = re.sub(r"[^a-z0-9\s']", "", message.casefold().replace("’", "'"))
    normalized = " ".join(normalized.split())

    if normalized in {"hi", "hello", "hey", "good morning", "good afternoon", "good evening"}:
        return "Hi! I can help with medical and health questions. What would you like to know?"

    if normalized in {
        "thanks",
        "thank you",
        "thanks so much",
        "thank you so much",
        "thanks a lot",
        "thank you for your help",
    }:
        return "You're welcome! I'm here if you have another health question."

    if normalized in {"how are you", "how are you doing"}:
        return "I'm here and ready to help with medical and health questions. How can I help?"

    if normalized in {"who are you", "what can you do"}:
        return "I'm a medical education assistant. I can explain health topics and help you think through when to seek care, but I'm not a clinician."

    if normalized in {"ok", "okay", "got it", "that helps", "thanks that helps"}:
        return "Glad that helped. Feel free to ask if you have another health question."

    if normalized in {"bye", "goodbye", "see you", "take care"}:
        return "Take care! Come back anytime you have a health question."

    return None

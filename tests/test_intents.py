import unittest

from app.intents import basic_conversation_reply


class BasicConversationReplyTests(unittest.TestCase):
    def test_handles_thanks_with_punctuation(self):
        self.assertIn("You're welcome", basic_conversation_reply("Thanks!"))

    def test_handles_greeting(self):
        self.assertIn("Hi!", basic_conversation_reply("Good morning"))

    def test_does_not_consume_mixed_medical_question(self):
        self.assertIsNone(basic_conversation_reply("Thanks, what causes chest pain?"))

    def test_leaves_medical_questions_for_medical_assistant(self):
        self.assertIsNone(basic_conversation_reply("What causes headaches?"))


if __name__ == "__main__":
    unittest.main()

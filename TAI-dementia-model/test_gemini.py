import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-2.5-flash')
try:
    response = model.generate_content("Hello")
    print("SUCCESS: ", response.text)
except Exception as e:
    import traceback
    traceback.print_exc()

"""Run inside the backend container: python scripts/diagnostics.py [REPORT_ID].

No ID: list recent reports. ID: stream its ZIP to stdout. No public read API.
"""
import os
import sys
from bson import ObjectId
from gridfs import GridFSBucket
from pymongo import MongoClient

client = MongoClient(os.environ["MONGO_URL"])
db = client["cube_studio"]
if len(sys.argv) == 1:
    for item in db["diagnostic_archives.files"].find().sort("uploadDate", -1).limit(30):
        print(item["_id"], item["uploadDate"].isoformat(), item["length"], item.get("metadata", {}).get("build"))
else:
    GridFSBucket(db, bucket_name="diagnostic_archives").download_to_stream(ObjectId(sys.argv[1]), sys.stdout.buffer)
client.close()

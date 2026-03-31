

### TO SETUP 

1. download UV
Use curl to download the script and execute it with sh:


```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

If your system doesn't have curl, you can use wget:

```bash

wget -qO- https://astral.sh/uv/install.sh | sh

```


2. use python >3.10

```bash
uv python install 3.10
```


3. create uv virtual environment

```bash
uv venv
```


4.  install  requirements

```bash
uv pip install -r requirements.txt

```



5. install ngrok

```bash
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
  | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null \
  && echo "deb https://ngrok-agent.s3.amazonaws.com bookworm main" \
  | sudo tee /etc/apt/sources.list.d/ngrok.list \
  && sudo apt update \
  && sudo apt install ngrok

```



6. add ngrok token
```bash
ngrok config add-authtoken "NGROK-TOKEN"
```



7. fill .env 




### POSTGRES FOR STUDY ROOMS

The room backend now uses PostgreSQL via `DATABASE_URL`.

1. copy the env template values you need from `.env.example`
2. start Postgres:

```bash
docker compose up -d postgres
```

3. if you are using the local project venv, install deps there:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

Default room database URL:

```bash
postgresql://postgres:postgres@localhost:5432/majorproject1
```

Live study-room updates are available over:

```bash
ws://localhost:5000/rooms/{room_id}/ws?user_id={user_id}
```



### TO RUN

in sequence
open 3 terminals

1. terminal1

```bash
source .env;
source .venv/bin/activate;
python3 -m uvicorn src.InferenceServer:app --host 0.0.0.0 --port 8000 --reload
```

2. terminal2

```bash
source .env;
source .venv/bin/activate;
python3 -m uvicorn src.server:app --host 0.0.0.0 --port 5000 --reload
```

3. terminal3

```bash
ngrok http 5000
```


=====================================================================================

### Endpoints

check the `test.py` for payload format
check the `src/server.py` for the endpoints
check the `endpoints.md` for all input / output format


=========================================================================================
--- plan and implement---


query -- rerankers , query re write/breakdown  , feedback loops 
 
performance -- prompt caching , canary rollouts , rollback plans ,ci/cd , cost latency throughput

safety -- guard rails , prompt injection & jail break defence 

evaluation -- eval the correctness

memory -- vector + grapg + episodic , pruning... memory policy ,  context chaining ,memory pruning

--- plan and implement---



https://chatgpt.com/c/68ec1ba2-7728-8323-be9e-6e52f2245aaa


const jokeFeed = document.getElementById("jokeFeed");
const postBtn = document.getElementById("postBtn");
const authorInput = document.getElementById("author");
const jokeInput = document.getElementById("jokeText");

let jokes = JSON.parse(localStorage.getItem("jokeMarket")) || [];
let sortMode = "top"; // "top" or "new"

function save() {
  localStorage.setItem("jokeMarket", JSON.stringify(jokes));
}

function score(joke) {
  return joke.laughs - joke.mehs;
}

function sortedJokes() {
  const list = [...jokes];
  if (sortMode === "top") {
    list.sort((a, b) => score(b) - score(a));
  }
  return list;
}

function render() {
  jokeFeed.innerHTML = `
    <div style="margin-bottom:15px;">
      <button id="sortTop">Top</button>
      <button id="sortNew">Newest</button>
    </div>
  `;

  document.getElementById("sortTop").onclick = () => {
    sortMode = "top";
    render();
  };
  document.getElementById("sortNew").onclick = () => {
    sortMode = "new";
    render();
  };

  sortedJokes().forEach(joke => {
    const div = document.createElement("div");
    div.className = "joke";

    div.innerHTML = `
      <p>${joke.text}</p>
      <small>— ${joke.author}</small>

      <div class="vote">
        😂 ${joke.laughs}
        <button data-id="${joke.id}" data-type="laugh">Funny</button>
        😐 ${joke.mehs}
        <button data-id="${joke.id}" data-type="meh">Meh</button>
        <strong style="margin-left:10px;">Score: ${score(joke)}</strong>
      </div>

      <div class="riffs">
        <strong>Riffs</strong>
        <div class="riff-list">
          ${(joke.riffs || []).map(r =>
            `<div class="riff"><em>${r.author}:</em> ${r.text}</div>`
          ).join("")}
        </div>
        <input data-riff-author="${joke.id}" placeholder="Your name" />
        <input data-riff-text="${joke.id}" placeholder="Add a riff..." />
        <button data-riff-btn="${joke.id}">Add Riff</button>
      </div>
    `;

    jokeFeed.appendChild(div);
  });
}

postBtn.addEventListener("click", () => {
  const text = jokeInput.value.trim();
  if (!text) return;

  const author = authorInput.value.trim() || "Anonymous";

  jokes.unshift({
    id: Date.now(),
    text,
    author,
    laughs: 0,
    mehs: 0,
    riffs: []
  });

  jokeInput.value = "";
  save();
  render();
});

jokeFeed.addEventListener("click", e => {
  const id = Number(
    e.target.dataset.id ||
    e.target.dataset.riffBtn
  );

  if (!id) return;

  const joke = jokes.find(j => j.id === id);
  if (!joke) return;

  if (e.target.dataset.type === "laugh") joke.laughs++;
  if (e.target.dataset.type === "meh") joke.mehs++;

  if (e.target.dataset.riffBtn) {
    const a = document.querySelector(`input[data-riff-author="${id}"]`);
    const t = document.querySelector(`input[data-riff-text="${id}"]`);
    const riffText = t.value.trim();
    if (!riffText) return;

    joke.riffs.push({
      author: a.value.trim() || "Anonymous",
      text: riffText
    });

    t.value = "";
  }

  save();
  render();
});

render();

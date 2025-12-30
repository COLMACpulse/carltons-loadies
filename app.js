const jokeFeed = document.getElementById("jokeFeed");
const postBtn = document.getElementById("postBtn");
const authorInput = document.getElementById("author");
const jokeInput = document.getElementById("jokeText");

let jokes = JSON.parse(localStorage.getItem("jokeMarket")) || [];

function save() {
  localStorage.setItem("jokeMarket", JSON.stringify(jokes));
}

function render() {
  jokeFeed.innerHTML = "";

  jokes.forEach(joke => {
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
    mehs: 0
  });

  jokeInput.value = "";
  save();
  render();
});

jokeFeed.addEventListener("click", e => {
  if (!e.target.dataset.id) return;

  const id = Number(e.target.dataset.id);
  const type = e.target.dataset.type;

  const joke = jokes.find(j => j.id === id);
  if (!joke) return;

  if (type === "laugh") joke.laughs++;
  if (type === "meh") joke.mehs++;

  save();
  render();
});

render();

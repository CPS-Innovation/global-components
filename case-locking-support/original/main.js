"use strict";

//var connection = new signalR.HubConnectionBuilder().withUrl("https://localhost:7154/section-view").build();
var connection = new signalR.HubConnectionBuilder()
  .withUrl("https://app-cms-presence-api.azurewebsites.net/section-view")
  .build();

//Disable the send button until connection is established.
document.getElementById("visitButton").disabled = true;

connection.on("Notify", function (users) {
  var message = "Active users:\r\n";
  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    message += user.user + " (" + user.appName + ")\r\n";
  }
  document.getElementById("status").innerText = message;
});

connection
  .start()
  .then(function () {
    document.getElementById("visitButton").disabled = false;
  })
  .catch(function (err) {
    return console.error(err.toString());
  });

document
  .getElementById("visitButton")
  .addEventListener("click", function (event) {
    var user = document.getElementById("username").value;
    var section = document.getElementById("section").value;

    connection
      .invoke("Connect", section, user, "Demo Client")
      .then(function () {
        document.getElementById("visitButton").disabled = true;
      })
      .catch(function (err) {
        return console.error(err.toString());
      });

    event.preventDefault();
  });

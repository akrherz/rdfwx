
const URI = "https://mesonet.agron.iastate.edu/json/current.json?";

function load_site(site) {

    $.ajax({
        url: `${URI}station=${site}&network=ISUSM`,
        type: "GET",
        dataType: "json",
        success: (data) => {
            const ob = data.last_ob;
            $("#airtemp").text(ob["airtemp[F]"]);
        }
    });
}


$(document).ready(() => {
    $("#site").change(() => {
        const site = $("#site").val();
        load_site(site);
    });
});
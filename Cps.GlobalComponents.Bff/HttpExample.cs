using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace MyFunctionApp
{
  public class HelloWorldFunction
  {
    private readonly ILogger<HelloWorldFunction> _logger;

    public HelloWorldFunction(ILogger<HelloWorldFunction> logger)
    {
      _logger = logger;
    }

    [Function("HelloWorld")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get", "post")] HttpRequestData req)
    {
      _logger.LogInformation("C# HTTP trigger function processed a request.");

      var x = new Cps.MasterDataService.Infrastructure.ApiClient.MdsApiClient(new HttpClient());

      var response = req.CreateResponse(HttpStatusCode.OK);
      response.Headers.Add("Content-Type", "text/plain; charset=utf-8");

      await response.WriteStringAsync("Hello World!");

      return response;
    }
  }
}